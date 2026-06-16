import json
import urllib.request
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

# Override built-in print in this module
print = safe_print

def generate_post_content(api_key, text, date, category, tone, platform, audience='Developers', length='Standard', keywords=''):
    """
    Constructs the prompt, calls the Google Gemini API, and processes the response.
    Returns the generated post text.
    Raises Exception on failure.
    """
    platform = platform.lower()
    
    # Customize instructions based on Target Audience
    audience_instructions = ""
    if audience == 'Developers':
        audience_instructions = "The target audience is Developers and Data Engineers. Focus on technical features, syntax, performance details, and developer tooling impact."
    elif audience == 'Executives':
        audience_instructions = "The target audience is Technical Executives and Managers. Focus on cost-efficiency, scalability, security compliance, business value, and ROI."
    elif audience == 'General Public':
        audience_instructions = "The target audience is the General Technical Public. Keep it clear, accessible, and explain the practical usefulness of the feature."
        
    # Customize instructions based on Post Length
    length_instructions = ""
    if length == 'Short':
        length_instructions = "Make the draft very short, punchy, and direct to the point. Strip out unnecessary explanations."
    elif length == 'Detailed':
        length_instructions = "Provide a detailed explanation of the update, including background context, features, and detailed steps/points if appropriate."
    elif length == 'Standard':
        length_instructions = "Create a standard, well-balanced post summarizing the main highlights of the update."
        
    # Customize instructions based on Custom Keywords
    keywords_instructions = ""
    if keywords:
        keywords_instructions = f"Naturally integrate and highlight the following custom keywords or phrases in the draft: {keywords}."
    
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

Target Audience Guidance:
{audience_instructions}

Length Guidance:
{length_instructions}

{keywords_instructions}

Target Platform Instructions:
{platform_instructions}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "maxOutputTokens": 4096,
            "temperature": 0.7
        }
    }
    
    # Debug logs (safely printed)
    print("\n=== GEMINI REQUEST PROMPT ===")
    print(prompt)
    print("=== GEMINI PAYLOAD ===")
    print(payload)

    req_data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')
    
    with urllib.request.urlopen(req, timeout=15) as response:
        response_code = response.getcode()
        response_body = response.read().decode('utf-8')
        
    response_data = json.loads(response_body)
    
    print("=== GEMINI RAW RESPONSE ===")
    print(response_data)
    
    if 'candidates' not in response_data or not response_data['candidates']:
        raise Exception("No generation candidate returned by Gemini API")
        
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
        
    return post_text
