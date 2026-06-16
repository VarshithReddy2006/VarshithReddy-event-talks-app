# 🌌 BigQuery Release Companion & AI Social Compiler

[![Python Version](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)
[![Flask Framework](https://img.shields.io/badge/framework-Flask--3.0.3-violet.svg)](https://flask.palletsprojects.com/)
[![SQLite Database](https://img.shields.io/badge/database-SQLite--3-cyan.svg)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

An intelligence dashboard and AI-powered content automation platform that parses Google Cloud BigQuery release notes, classifies updates by technical domains, and compiles platform-optimized updates (X/Twitter, LinkedIn, Slack) using Google Gemini AI.

---

## 🚀 Key Features

### 1. Ingestion & Structured Feeds
* **Atom XML Parsing**: Retrieves Google Cloud's official BigQuery Atom feed.
* **Granular Extraction**: Automatically parses and splits daily feed items by `<h3>` tags to separate individual release announcements.
* **Persistent Cache Engine**: Caches XML feed content inside a local database cache to prevent rate-limiting or redundant network calls.

### 2. Intelligent Categorization & Domain Rules
* **Category Tagging**: Groups entries dynamically into *Feature, Changed, Deprecated, Resolved, General* categories.
* **Domain Classifier**: Integrates a regex engine mapping updates to engineering domains:
  * 🧮 *SQL & Querying*
  * 🧠 *Machine Learning & AI*
  * 🔒 *Security & Identity*
  * ⚡ *Performance & Storage*
  * 🎨 *Studio & Console*
  * 📥 *Ingestion & Transfer*
* **Metrics Dashboard**: Computes update totals, features counts, days tracked, and visualizes tag density via responsive progress-bar charts.

### 🤖 3. Advanced Gemini AI Composer
* **Tab-Specific Caching**: Retains your draft progress for each platform in local state memory, so switching tabs does not clear your edits.
* **Flexible AI Parameters**:
  * **Tone**: *Professional*, *Tech Enthusiast*, *Hype / Exciting*, *ELI5*.
  * **Target Audience**: Shapes prompt guidelines (e.g. schema/syntax for *Developers*, vs. ROI/scalability metrics for *Executives*).
  * **Post Length**: *Short & Punchy*, *Standard / Balanced*, *Detailed & Long*.
  * **Custom Keywords**: Naturally blends user-specified keywords directly into the AI-generated draft.
* **Terminal Safety**: Overrides output printers with structured CP1252/ASCII fallback handlers to prevent Windows console crashes on emojis/unicode symbols.

### 📢 4. Automated Broadcasts
* **Multi-Platform Hooks**: Redirection intents for Twitter/X, clipboard copy for LinkedIn, and direct server-side post handlers for Slack.
* **Auto-Sync Daemon**: A background worker thread polls Google's XML feed every 10 minutes. If new releases are found, it automatically formats and posts them to your configured Slack webhook.
* **Sync Health Dot**: The header displays a live, glowing pulse dot polled every 30 seconds indicating the status of the background task (*Active, Syncing, Error, Inactive*).

---

## 🛠️ Architecture & Tech Stack

```
                                  +-------------------+
                                  |   Google Cloud    |
                                  |   BigQuery Feed   |
                                  +---------+---------+
                                            |
                                            v (urllib XML parser)
+-------------------+             +---------+---------+
|   Web Browser     |<----------->|   Flask Server    |
| (JS State Engine) |  REST APIs  |     (app.py)      |
+-------------------+             +----+----+----+----+
                                       |    |    |
          +----------------------------+    |    +----------------------------+
          v                                 v                                 v
+---------+---------+             +---------+---------+             +---------+---------+
|  SQLite Database  |             |  Gemini AI API    |             |   Slack Incoming  |
|  (companion.db)   |             | (text_generator)  |             |      Webhook      |
+-------------------+             +-------------------+             +-------------------+
```

* **Frontend**: Vanilla HTML5, CSS3 Grid/Flexbox layouts, dark mode glassmorphic interface, FontAwesome icons, and custom CSS micro-animations.
* **Backend**: Python Flask routing, thread-safe database pooling, and native XML tree parsers.
* **Database**: SQLite3 relational storage mapping cache states, credentials, and known release entry histories.
* **AI Model**: Google Gemini API (`gemini-3.5-flash`).

---

## ⚡ Setup & Installation

### Prerequisites
* Python 3.8 or higher
* A Google Gemini API Key

### 1. Clone & Navigate
```bash
git clone https://github.com/VarshithReddy2006/VarshithReddy-event-talks-app.git
cd VarshithReddy-event-talks-app
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the Server
```bash
python app.py
```
Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

---

## ⚙️ Configuration & Credentials

All secrets are managed via the **Settings gear icon** in the top-right header:
1. Click the gear icon to open the **API Settings** panel.
2. Enter your **Gemini API Key** and **Slack Webhook URL** (optional).
3. Click **Save Settings**. 

*Note: Secrets are saved securely in a local relational SQLite database (`companion.db`) and are never committed to git (automatically ignored).*

---

## 🔒 Security & Git Hygiene
The database binaries (`companion.db`) and legacy credential configurations are explicitly ignored in `.gitignore`:
```text
# User credentials
config.json
config.json.bak
companion.db
```
This ensures your API keys and webhook URLs are kept secure on your local server.

---

## 📄 License
This project is licensed under the MIT License.
