import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request
import json
import threading
import time
import builtins

def safe_print(*args, **kwargs):
    try:
        builtins.print(*args, **kwargs)
    except UnicodeEncodeError:
        new_args = []
        for arg in args:
            if isinstance(arg, str):
                new_args.append(arg.encode('ascii', errors='backslashreplace').decode('ascii'))
            elif isinstance(arg, (dict, list)):
                try:
                    s = json.dumps(arg, indent=2)
                    new_args.append(s.encode('ascii', errors='backslashreplace').decode('ascii'))
                except Exception:
                    new_args.append(repr(arg))
            else:
                new_args.append(arg)
        try:
            builtins.print(*new_args, **kwargs)
        except Exception:
            pass

# Override built-in print for app.py
print = safe_print

app = Flask(__name__)

CONFIG_FILE = "config.json"

# Global state for background worker
known_entry_ids = set()
background_status = {
    "last_sync_time": "Never",
    "sync_count": 0,
    "status": "Inactive"
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(config_data):
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception:
        return False


# Simple in-memory cache to prevent overloading Google's feeds
cache = {
    "data": None,
    "last_fetched": None
}

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html_for_text(html_content):
    # Remove HTML tags
    text = re.sub(r'<[^>]*>', '', html_content)
    # Decode common HTML entities
    text = text.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&quot;', '"').replace('&#39;', "'")
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def classify_update_tags(text):
    text_lower = text.lower()
    tags = []
    
    rules = {
        "SQL & Querying": ["sql", "query", "select", "join", "table", "syntax", "analytical", "udf", "stored procedure"],
        "Machine Learning & AI": ["bqml", "ml", "generative ai", "gemini", "vertex", "model", "predict", "llm", "ai.", "vector", "embed"],
        "Security & Identity": ["security", "iam", "permission", "encryption", "kms", "policy", "grant", "governance", "vpc", "credentials", "authorized", "role"],
        "Performance & Storage": ["performance", "cost", "price", "pricing", "billing", "capacity", "optimize", "partition", "cluster", "slots", "reservation", "index", "search"],
        "Studio & Console": ["studio", "console", "ui", "workspace", "editor", "explorer", "history", "pane", "tab", "chart"],
        "Ingestion & Transfer": ["ingest", "load", "export", "stream", "transfer", "pubsub", "gcs", "storage", "format", "json", "avro", "parquet", "csv"]
    }
    
    for tag, keywords in rules.items():
        for keyword in keywords:
            if keyword == "ai.":
                if "ai." in text_lower:
                    tags.append(tag)
                    break
            elif keyword in text_lower:
                tags.append(tag)
                break
                
    if not tags:
        tags.append("General Admin")
        
    return tags

def parse_feed_xml(xml_data):
    root = ET.fromstring(xml_data)
    ns = {'ns': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('ns:entry', ns)
    
    release_notes_by_date = []
    
    for entry in entries:
        title_el = entry.find('ns:title', ns)
        title = title_el.text if title_el is not None else "Unknown Date"
        
        updated_el = entry.find('ns:updated', ns)
        updated = updated_el.text if updated_el is not None else ""
        
        content_el = entry.find('ns:content', ns)
        content_html = content_el.text if content_el is not None else ""
        
        # Split entry content by <h3> elements
        parts = re.split(r'(?i)<\s*h3\s*>', content_html)
        updates = []
        
        # Handle content before the first <h3> (if any)
        first_part = parts[0].strip()
        if first_part:
            text = clean_html_for_text(first_part)
            if text:
                updates.append({
                    "id": f"{title.replace(' ', '_').replace(',', '')}_0",
                    "category": "General",
                    "html": first_part,
                    "text": text,
                    "tags": classify_update_tags(text)
                })
                
        for idx, part in enumerate(parts[1:]):
            sub_parts = re.split(r'(?i)<\s*/\s*h3\s*>', part, maxsplit=1)
            if len(sub_parts) == 2:
                category = sub_parts[0].strip()
                body = sub_parts[1].strip()
            else:
                category = "Update"
                body = part.strip()
                
            text = clean_html_for_text(body)
            if text:
                updates.append({
                    "id": f"{title.replace(' ', '_').replace(',', '')}_{idx + 1}",
                    "category": category,
                    "html": body,
                    "text": text,
                    "tags": classify_update_tags(text)
                })
                
        if updates:
            release_notes_by_date.append({
                "date": title,
                "updated": updated,
                "updates": updates
            })
            
    return release_notes_by_date

def background_sync_worker():
    global known_entry_ids
    print("[Background Sync] Worker thread started.")
    background_status["status"] = "Active"
    
    # Wait a bit on start to let the app initialize and make the first load
    time.sleep(5)
    
    # First-time load to populate known IDs (so we don't alert on boot)
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravityFeedReader/1.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
        root = ET.fromstring(xml_data)
        ns = {'ns': 'http://www.w3.org/2005/Atom'}
        entries = root.findall('ns:entry', ns)
        for entry in entries:
            entry_id_el = entry.find('ns:id', ns)
            if entry_id_el is not None:
                known_entry_ids.add(entry_id_el.text)
        print(f"[Background Sync] Initialized. Loaded {len(known_entry_ids)} known entries.")
    except Exception as e:
        print("[Background Sync] Initialization error:", str(e))
        
    while True:
        # Loop every 10 minutes (600 seconds)
        time.sleep(600)
        
        try:
            background_status["status"] = "Syncing..."
            req = urllib.request.Request(
                FEED_URL, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravityFeedReader/1.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                xml_data = response.read()
                
            root = ET.fromstring(xml_data)
            ns = {'ns': 'http://www.w3.org/2005/Atom'}
            entries = root.findall('ns:entry', ns)
            
            new_entries = []
            for entry in entries:
                entry_id_el = entry.find('ns:id', ns)
                if entry_id_el is not None:
                    entry_id = entry_id_el.text
                    if entry_id not in known_entry_ids:
                        new_entries.append(entry)
                    
            if new_entries:
                print(f"[Background Sync] Found {len(new_entries)} new release note entries!")
                config = load_config()
                slack_webhook = config.get('slack_webhook_url') or os.environ.get('SLACK_WEBHOOK_URL')
                
                # Process oldest first
                for entry in reversed(new_entries):
                    title_el = entry.find('ns:title', ns)
                    title = title_el.text if title_el is not None else "New Update"
                    content_html = entry.find('ns:content', ns).text or ""
                    
                    # Parse updates
                    updates = []
                    parts = re.split(r'(?i)<\s*h3\s*>', content_html)
                    first_part = parts[0].strip()
                    if first_part:
                        text = clean_html_for_text(first_part)
                        if text:
                            updates.append({"category": "General", "text": text})
                            
                    for idx, part in enumerate(parts[1:]):
                        sub_parts = re.split(r'(?i)<\s*/\s*h3\s*>', part, maxsplit=1)
                        if len(sub_parts) == 2:
                            category = sub_parts[0].strip()
                            body = sub_parts[1].strip()
                        else:
                            category = "Update"
                            body = part.strip()
                        text = clean_html_for_text(body)
                        if text:
                            updates.append({"category": category, "text": text})
                            
                    # Post updates to Slack webhook
                    if slack_webhook and updates:
                        for u in updates:
                            slack_message = f"*📢 New BigQuery Update Alert ({title})* \n" \
                                            f"• *Category*: _{u['category']}_\n" \
                                            f"• *Update*: {u['text']}\n" \
                                            f"• *Broadcast*: _Automated from Antigravity Release Companion_"
                            
                            try:
                                import requests as req_lib
                                req_lib.post(slack_webhook, json={"text": slack_message}, headers={'Content-Type': 'application/json'}, timeout=10)
                                print(f"[Background Sync] Auto-posted to Slack: {u['category']}")
                            except Exception as slack_err:
                                print(f"[Background Sync] Auto-Slack post error: {str(slack_err)}")
                                
                    entry_id_el = entry.find('ns:id', ns)
                    if entry_id_el is not None:
                        known_entry_ids.add(entry_id_el.text)
                
                # Update global cache
                parsed_data = parse_feed_xml(xml_data)
                cache["data"] = parsed_data
                cache["last_fetched"] = datetime.now().strftime("%I:%M:%S %p")
                
            background_status["sync_count"] += 1
            background_status["last_sync_time"] = datetime.now().strftime("%I:%M:%S %p")
            background_status["status"] = "Active"
            
        except Exception as e:
            print("[Background Sync] Error during poll loop:", str(e))
            background_status["status"] = "Error"

# Start background sync worker daemon thread
threading.Thread(target=background_sync_worker, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    if force_refresh or cache["data"] is None:
        try:
            req = urllib.request.Request(
                FEED_URL, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravityFeedReader/1.0'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                xml_data = response.read()
            
            parsed_data = parse_feed_xml(xml_data)
            cache["data"] = parsed_data
            cache["last_fetched"] = datetime.now().strftime("%I:%M:%S %p")
        except Exception as e:
            # Fallback to cache if available
            if cache["data"] is not None:
                return jsonify({
                    "data": cache["data"],
                    "last_fetched": cache["last_fetched"],
                    "warning": f"Could not connect to BigQuery feed. Displaying cached copy."
                })
            return jsonify({"error": f"Failed to retrieve feed: {str(e)}"}), 500
            
    return jsonify({
        "data": cache["data"],
        "last_fetched": cache["last_fetched"]
    })

@app.route('/api/generate-post', methods=['POST'])
def generate_post():
    data = request.get_json() or {}
    text = data.get('text', '')
    date = data.get('date', '')
    category = data.get('category', '')
    tone = data.get('tone', 'Tech Enthusiast')
    platform = data.get('platform', 'twitter').lower()
    audience = data.get('audience', 'Developers')
    length = data.get('length', 'Standard')
    keywords = data.get('keywords', '')
    
    # Check for API key in header first, then in config, then in environment
    config = load_config()
    api_key = request.headers.get('X-Gemini-Key') or config.get('gemini_api_key') or os.environ.get('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({
            "error": "Gemini API key is missing. Please set it in the settings panel."
        }), 400

    try:
        from text_generator import generate_post_content
        post_text = generate_post_content(
            api_key=api_key,
            text=text,
            date=date,
            category=category,
            tone=tone,
            platform=platform,
            audience=audience,
            length=length,
            keywords=keywords
        )
        return jsonify({"post": post_text})
    except Exception as e:
        return jsonify({"error": f"Failed to generate post: {str(e)}"}), 500

@app.route('/api/send-slack', methods=['POST'])
def send_slack():
    data = request.get_json() or {}
    message = data.get('message', '')
    
    config = load_config()
    webhook_url = data.get('webhook_url') or config.get('slack_webhook_url') or os.environ.get('SLACK_WEBHOOK_URL')
    
    if not webhook_url:
        return jsonify({"error": "Slack Webhook URL is missing. Please configure it in Settings."}), 400
        
    if not message:
        return jsonify({"error": "Message is empty."}), 400
        
    try:
        import requests as req_lib
        payload = {
            "text": message
        }
        headers = {'Content-Type': 'application/json'}
        response = req_lib.post(webhook_url, json=payload, headers=headers, timeout=10)
        
        if response.status_code not in [200, 201]:
            return jsonify({"error": f"Slack API returned {response.status_code}: {response.text}"}), 400
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": f"Failed to send to Slack: {str(e)}"}), 500

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    if request.method == 'POST':
        data = request.get_json() or {}
        gemini_key = data.get('gemini_api_key', '').strip()
        slack_url = data.get('slack_webhook_url', '').strip()
        
        config = load_config()
        if gemini_key and '*' not in gemini_key:
            config['gemini_api_key'] = gemini_key
        elif not gemini_key:
            config['gemini_api_key'] = ''
            
        if slack_url and '*' not in slack_url:
            config['slack_webhook_url'] = slack_url
        elif not slack_url:
            config['slack_webhook_url'] = ''
            
        if save_config(config):
            return jsonify({"success": True})
        return jsonify({"error": "Failed to save settings on server."}), 500
    else:
        config = load_config()
        
        # Mask the keys for safety
        masked_gemini = ""
        gemini_key = config.get('gemini_api_key', '')
        if gemini_key:
            masked_gemini = gemini_key[:8] + "*" * (len(gemini_key) - 8)
            
        masked_slack = ""
        slack_url = config.get('slack_webhook_url', '')
        if slack_url:
            masked_slack = slack_url[:15] + "*" * (len(slack_url) - 15)
            
        return jsonify({
            "gemini_api_key": masked_gemini,
            "slack_webhook_url": masked_slack,
            "has_gemini_key": bool(gemini_key),
            "has_slack_url": bool(slack_url)
        })

@app.route('/api/sync-status')
def get_sync_status():
    return jsonify({
        "last_sync_time": background_status["last_sync_time"],
        "sync_count": background_status["sync_count"],
        "status": background_status["status"],
        "known_count": len(known_entry_ids)
    })



if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
