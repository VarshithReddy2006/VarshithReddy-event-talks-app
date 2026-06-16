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

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
