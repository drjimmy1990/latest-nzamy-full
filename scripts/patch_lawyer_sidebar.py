import sys

file_path = r"src/constants/navigation.sidebars.legal.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """      { label: "مدير العقود",    labelEn: "Contracts",       href: "/dashboard/lawyer/contracts", icon: "FileText" },
      { label: "المستندات",      labelEn: "Documents",        href: "/dashboard/lawyer/documents", icon: "FolderOpen" },"""

repl = """      { label: "مدير العقود",    labelEn: "Contracts",       href: "/dashboard/lawyer/contracts", icon: "FileText" },
      { label: "المستندات",      labelEn: "Documents",        href: "/dashboard/lawyer/documents", icon: "FolderOpen" },
      { label: "خزنة المطبوعات والهوية", labelEn: "Vault & Letterhead", href: "/ai/vault", icon: "Vault", badge: "مطبوعاتك" },"""

if target not in content:
    print("Error: target not found in content!")
    sys.exit(1)

content = content.replace(target, repl, 1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully added vault to lawyer sidebar")
