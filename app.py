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
                    "text": text
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
                    "text": text
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

@app.route('/api/generate-tweet', methods=['POST'])
def generate_tweet():
    data = request.get_json() or {}
    text = data.get('text', '')
    date = data.get('date', '')
    category = data.get('category', '')
    tone = data.get('tone', 'Tech Enthusiast')
    
    # Check for API key in header first, then in environment
    api_key = request.headers.get('X-Gemini-Key') or os.environ.get('GEMINI_API_KEY')
    
    if not api_key:
        return jsonify({
            "error": "Gemini API key is missing. Please set it in the settings panel."
        }), 400
        
    prompt = f"""You are a developer relations specialist and social media manager.
Draft a short X/Twitter post (maximum 280 characters including hashtags) announcing the following Google Cloud BigQuery release note.

Release Note Date: {date}
Category: {category}
Content: {text}

Requested Tone: {tone}

Instructions:
1. Ensure the final text is strictly under 280 characters (including hashtags).
2. Include relevant hashtags like #BigQuery #GCP.
3. Make it engaging and appropriate for the requested tone:
   - Professional: Clear, industry-standard language, focuses on business value.
   - Tech Enthusiast: Highlights technical specs, features, and how it helps developers.
   - Hype: Uses emojis, exclamation marks, and highlights major improvements.
   - ELI5: Extremely simple language, explains the core concept in layman terms.
4. Output ONLY the raw tweet text. Do not include quotes around the tweet, introductory text, or explanatory footnotes."""

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
            
        tweet_text = response_data['candidates'][0]['content']['parts'][0]['text'].strip()
        print("=== EXTRACTED TWEET TEXT ===")
        print(tweet_text)
        
        # Strip quotes if AI returned it inside quotes
        if tweet_text.startswith('"') and tweet_text.endswith('"'):
            tweet_text = tweet_text[1:-1].strip()
        elif tweet_text.startswith("'") and tweet_text.endswith("'"):
            tweet_text = tweet_text[1:-1].strip()
            
        print("=== FINAL TWEET TEXT ===")
        print(tweet_text)
        print("=======================\n")
            
        return jsonify({"tweet": tweet_text})
        
    except Exception as e:
        return jsonify({"error": f"Failed to generate tweet: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
