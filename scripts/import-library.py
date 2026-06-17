#!/usr/bin/env python3
import os
import re
import json
import yaml
import requests
import argparse

# ==========================================
# CONFIGURATION & CONSTANTS
# ==========================================
# Set environment variables or update these values
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://your-project.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ==========================================
# HELPERS
# ==========================================
def parse_yaml_frontmatter(content):
    """Extracts YAML frontmatter block from the top of the file."""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if match:
        yaml_content = match.group(1)
        remaining_content = content[match.end():]
        try:
            return yaml.safe_load(yaml_content), remaining_content
        except yaml.YAMLError as e:
            print(f"Error parsing YAML frontmatter: {e}")
            return {}, remaining_content
    return {}, content

# ==========================================
# PARSERS
# ==========================================
def import_law_markdown(file_path):
    """Parses laws with articles and executive regulations."""
    print(f"\n[+] Parsing Law: {os.path.basename(file_path)}")
    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()

    frontmatter, content = parse_yaml_frontmatter(raw_content)
    
    # Extract metadata
    law_id = frontmatter.get("id") or os.path.basename(file_path).replace(".md", "")
    slug = frontmatter.get("slug") or law_id
    
    law_data = {
        "id": law_id,
        "slug": slug,
        "title": frontmatter.get("title", "نظام قانوني"),
        "category": frontmatter.get("section_code", "general"),
        "metadata": frontmatter
    }
    
    # Upload main law entry
    req = requests.post(f"{SUPABASE_URL}/rest/v1/laws", json=law_data, headers=headers)
    if req.status_code not in [200, 201]:
        print(f"[-] Law entry creation details: {req.text}")
    else:
        print(f"[✓] Law metadata successfully uploaded.")

    # Find all articles
    article_pattern = re.compile(
        r'<!--\s*ARTICLE_START\s*(.*?)\s*-->\s*(.*?)\s*(<!--\s*ARTICLE_END\s*-->)', 
        re.DOTALL
    )
    
    articles = list(article_pattern.finditer(content))
    print(f"[*] Found {len(articles)} articles inside law document.")
    
    for idx, match in enumerate(articles, start=1):
        meta_str = match.group(1)
        article_body = match.group(2)
        
        try:
            meta = json.loads(meta_str)
        except json.JSONDecodeError as e:
            print(f"[!] JSON parsing error in article {idx}: {e}")
            continue
            
        # Parse nested regulations
        regulation_pattern = re.compile(
            r'<!--\s*REGULATION\s*(.*?)\s*-->\s*(.*?)\s*(?=<!--|$)', 
            re.DOTALL
        )
        
        # Clean article text
        clean_article_text = re.sub(r'<!--\s*REGULATION.*', '', article_body, flags=re.DOTALL).strip()
        clean_article_text = re.sub(r'^###\s+.*?\n', '', clean_article_text).strip() # Remove MD Header

        article_number_text = meta.get("number_text") or meta.get("number", "")
        article_number = str(meta.get("number", "0"))
        
        article_payload = {
            "law_id": law_id,
            "chapter_title": meta.get("chapter_title", ""),
            "article_number": article_number,
            "article_number_text": article_number_text,
            "text": clean_article_text,
            "status": meta.get("status", "active"),
            "free": meta.get("free", True),
            "metadata": meta
        }
        
        # Insert Article
        art_req = requests.post(f"{SUPABASE_URL}/rest/v1/law_articles", json=article_payload, headers=headers)
        if art_req.status_code in [200, 201]:
            article_id = art_req.json()[0]['id']
            
            # Insert linked regulations
            regulations = list(regulation_pattern.finditer(article_body))
            for reg_match in regulations:
                reg_meta = json.loads(reg_match.group(1))
                reg_text = reg_match.group(2).replace(">", "").strip()
                
                reg_payload = {
                    "article_id": article_id,
                    "instrument": reg_meta.get("instrument", "لائحة تنفيذية"),
                    "reference": reg_meta.get("ref", ""),
                    "text": reg_text
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/law_regulations", json=reg_payload, headers=headers)
        else:
            print(f"[!] Failed to insert article {article_number}: {art_req.text}")
            
    print("[✓] Law importing completed.")

def import_principles_markdown(file_path):
    """Parses judicial principles and precedents."""
    print(f"\n[+] Parsing Judicial Principles: {os.path.basename(file_path)}")
    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()

    frontmatter, content = parse_yaml_frontmatter(raw_content)
    
    principle_pattern = re.compile(
        r'<!--\s*PRINCIPLE_START\s*(.*?)\s*-->\s*(.*?)\s*<!--\s*PRINCIPLE_END\s*-->', 
        re.DOTALL
    )
    
    principles = list(principle_pattern.finditer(content))
    print(f"[*] Found {len(principles)} principles in file.")
    
    for idx, match in enumerate(principles, start=1):
        meta_str = match.group(1)
        principle_body = match.group(2).replace(">", "").strip()
        
        try:
            meta = json.loads(meta_str)
        except json.JSONDecodeError as e:
            print(f"[!] JSON parsing error in principle {idx}: {e}")
            continue
            
        principle_payload = {
            "number": int(meta.get("number", 0)),
            "issuing_body": meta.get("issuing_body", ""),
            "issuing_body_abbr": meta.get("issuing_body_abbr", ""),
            "source_ref": meta.get("source_ref", ""),
            "date": meta.get("date", ""),
            "topic": meta.get("topic", ""),
            "text": principle_body,
            "free": True,
            "metadata": meta
        }
        
        requests.post(f"{SUPABASE_URL}/rest/v1/judicial_principles", json=principle_payload, headers=headers)
        
    print("[✓] Principles importing completed.")

def import_book_markdown(file_path):
    """Parses jurisprudential and legal books."""
    print(f"\n[+] Parsing Book Document: {os.path.basename(file_path)}")
    with open(file_path, "r", encoding="utf-8") as f:
        raw_content = f.read()

    meta_match = re.search(r'<!--\s*BOOK_METADATA\s*(.*?)\s*-->', raw_content)
    if not meta_match:
        print("[!] No BOOK_METADATA wrapper found. Skipping book.")
        return
        
    book_meta = json.loads(meta_match.group(1))
    book_id = os.path.basename(file_path).replace(".md", "")
    
    book_payload = {
        "id": book_id,
        "title": book_meta.get("title"),
        "author": book_meta.get("author"),
        "type": book_meta.get("type"),
        "publisher": book_meta.get("publisher"),
        "volumes_total": book_meta.get("volumes_total", 1),
        "metadata": book_meta
    }
    
    # Upload book details
    req = requests.post(f"{SUPABASE_URL}/rest/v1/books", json=book_payload, headers=headers)
    if req.status_code not in [200, 201]:
        print(f"[-] Book already exists or error: {req.text}")
    else:
        print(f"[✓] Book metadata successfully uploaded.")
        
    # Find pages
    page_pattern = re.compile(
        r'<!--\s*PAGE_START\s*(.*?)\s*-->\s*(.*?)\s*<!--\s*PAGE_END\s*-->', 
        re.DOTALL
    )
    
    pages = list(page_pattern.finditer(raw_content))
    print(f"[*] Found {len(pages)} pages in book file.")
    
    for idx, match in enumerate(pages, start=1):
        page_meta = json.loads(match.group(1))
        page_body = match.group(2)
        
        # Extract explanation text from SHARH wraps
        sharh_match = re.search(r'<!--\s*SHARH_START\s*-->(.*?)<!--\s*SHARH_END\s*-->', page_body, re.DOTALL)
        if sharh_match:
            page_text = sharh_match.group(1).strip()
        else:
            page_text = page_body.strip()
            
        content_payload = {
            "book_id": book_id,
            "volume": page_meta.get("vol", 1),
            "page": str(page_meta.get("page", "")),
            "chapter_title": book_meta.get("subject", ""),
            "text": page_text
        }
        
        requests.post(f"{SUPABASE_URL}/rest/v1/book_contents", json=content_payload, headers=headers)
        
    print("[✓] Book importing completed.")

# ==========================================
# MAIN EXECUTION CLI
# ==========================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Legal Library Markdown to Supabase Importer")
    parser.add_argument("--type", required=True, choices=["law", "principle", "book"], help="Document type to import")
    parser.add_argument("--file", required=True, help="Absolute path to markdown file")
    args = parser.parse_code = parser.parse_args()
    
    # Verify file existence
    if not os.path.exists(args.file):
        print(f"[-] File not found: {args.file}")
        exit(1)
        
    # Execute matching parser
    if args.type == "law":
        import_law_markdown(args.file)
    elif args.type == "principle":
        import_principles_markdown(args.file)
    elif args.type == "book":
        import_book_markdown(args.file)
