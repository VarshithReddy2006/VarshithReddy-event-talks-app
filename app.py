import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

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
    
    # Check for API key in header first, then in environment
    api_key = request.headers.get('X-Gemini-Key') or os.environ.get('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({
            "error": "Gemini API key is missing. Please set it in the settings panel."
        }), 400

    # Customize prompt depending on the target platform
    if platform == 'linkedin':
        platform_instructions = """
Draft a professional, engaging LinkedIn update (maximum 2000 characters) announcing this release note.
Instructions:
1. Make it professional but engaging, well-suited for a LinkedIn audience of data engineers, architects, and IT decision-makers.
2. Structure the post using bullet points, bold headers (using unicode bold like 𝗧𝗲𝗰𝗵 if appropriate, or plain text formatting), and emojis for readability.
3. Explain the business/technical value of this update clearly.
4. Include relevant professional hashtags at the end, such as #BigQuery #GoogleCloud #DataEngineering #CloudComputing.
5. Output ONLY the raw post content. No introductory sentences, quotes wrapping the post, or closing notes.
"""
    elif platform == 'slack':
        platform_instructions = """
Draft an internal Slack team announcement announcing this release note.
Instructions:
1. Use Slack Markdown formatting: use asterisks for *bolding*, underscores for _italics_, and proper list items (e.g. • or -).
2. Start with an announcement title (e.g., "*📢 BigQuery Update: [Date]*").
3. Include sections: "*What is it?*", "*Key Details*", and "*Action Required / Impact*".
4. Keep the tone helpful, clear, and informative for internal team developers and analysts.
5. Output ONLY the raw post content. No introductory sentences, quotes wrapping the post, or closing notes.
"""
    else: # Default: twitter
        platform_instructions = """
Draft a short X/Twitter post (maximum 280 characters including hashtags) announcing this release note.
Instructions:
1. Ensure the final text is strictly under 280 characters (including hashtags).
2. Include relevant hashtags like #BigQuery #GCP.
3. Output ONLY the raw tweet text. No introductory sentences, quotes wrapping the post, or explanatory footnotes.
"""

    prompt = f"""You are a developer relations specialist and technical writer.
We need to post about the following Google Cloud BigQuery release note:

Release Note Date: {date}
Category: {category}
Content: {text}

Requested Tone: {tone} (Apply this tone to your draft:
- Professional: Clear, industry-standard language, focuses on business value.
- Tech Enthusiast: Highlights technical specs, features, and how it helps developers.
- Hype: Uses emojis, exclamation marks, and highlights major improvements.
- ELI5: Extremely simple language, explains the core concept in layman terms.)

Target Platform Instructions:
{platform_instructions}
"""

    try:
        import requests as req_lib  # Import locally to prevent variable collision
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
        headers = {'Content-Type': 'application/json'}
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "maxOutputTokens": 1024,
                "temperature": 0.7
            }
        }
        
        response = req_lib.post(url, json=payload, headers=headers, timeout=15)
        
        if response.status_code != 200:
            try:
                response_data = response.json()
                error_msg = response_data.get('error', {}).get('message', 'Unknown API Error')
            except Exception:
                error_msg = f"HTTP {response.status_code}: {response.text}"
            return jsonify({"error": f"Gemini API Error: {error_msg}"}), response.status_code
            
        response_data = response.json()
        
        # Debugging logs
        print("\n=== GEMINI REQUEST PROMPT ===")
        print(prompt)
        print("=== GEMINI RAW RESPONSE ===")
        print(response_data)
        
        if 'candidates' not in response_data or not response_data['candidates']:
            return jsonify({"error": "No generation candidate returned by Gemini API"}), 500
            
        post_text = response_data['candidates'][0]['content']['parts'][0]['text'].strip()
        print("=== EXTRACTED POST TEXT ===")
        print(post_text)
        
        # Strip quotes if AI returned it inside quotes
        if post_text.startswith('"') and post_text.endswith('"'):
            post_text = post_text[1:-1].strip()
        elif post_text.startswith("'") and post_text.endswith("'"):
            post_text = post_text[1:-1].strip()
            
        print("=== FINAL POST TEXT ===")
        print(post_text)
        print("=======================\n")
            
        return jsonify({"post": post_text})
        
    except Exception as e:
        return jsonify({"error": f"Failed to generate post: {str(e)}"}), 500

@app.route('/api/send-slack', methods=['POST'])
def send_slack():
    data = request.get_json() or {}
    message = data.get('message', '')
    webhook_url = data.get('webhook_url') or os.environ.get('SLACK_WEBHOOK_URL')
    
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


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
