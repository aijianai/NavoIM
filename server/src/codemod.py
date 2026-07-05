#!/usr/bin/env python3
"""
MySQL Migration Codemod v2
Transforms better-sqlite3 sync calls to mysql2 async calls.
Handles: S.xxx.get/all/run, db.prepare().get/all/run, db.exec, db.transaction
"""
import re, sys, os

def read_file(path):
    with open(path) as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def extract_stmts_sql(text):
    """Extract all SQL strings from the S= or stmts= object."""
    sqls = {}
    # Match: name: db.prepare("SQL"), or name: db.prepare(`SQL`),
    for m in re.finditer(r'(\w+):\s*db\.prepare\(["`]([^"`]+)["`]\)', text):
        sqls[m.group(1)] = m.group(2)
    # Multi-line ones with concatenation
    for m in re.finditer(r'(\w+):\s*db\.prepare\(\s*\n\s*["`]([^"`]+)["`]', text):
        sqls[m.group(1)] = m.group(2)
    return sqls

def transform_db_ts():
    """Write new db.ts with MySQL pool."""
    content = '''import fs from "node:fs";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { config } from "./config.js";

fs.mkdirSync(config.uploadsDir, { recursive: true, mode: 0o700 });

const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return (rows as T[]) ?? [];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
  const [rows] = await pool.query(sql, params);
  return (rows as T[])[0];
}

export async function run(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId: number }> {
  const [result] = await pool.query(sql, params);
  const r = result as any;
  return { affectedRows: r?.affectedRows ?? 0, insertId: r?.insertId ?? 0 };
}

export async function exec(sql: string): Promise<void> {
  await pool.query(sql);
}

export { pool };
'''
    write_file('db.ts', content)
    print("✓ db.ts written")

def transform_config_ts():
    """Add MySQL config to config.ts."""
    content = read_file('config.ts')
    if 'mysql' not in content:
        # Add mysql config before redis config
        content = content.replace(
            "  redis: {",
            """  mysql: {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "navoim",
    password: process.env.MYSQL_PASSWORD ?? "navoim",
    database: process.env.MYSQL_DATABASE ?? "navoim",
  },
  redis: {"""
        )
        # Remove dataDir and dbFile (SQLite-specific)
        content = re.sub(r"\s*dataDir:.*?\n", "\n", content)
        content = re.sub(r"\s*dbFile:.*?\n", "\n", content)
    write_file('config.ts', content)
    print("✓ config.ts updated")

def transform_store_ts():
    """Transform store.ts from sync to async MySQL."""
    content = read_file('store.ts')
    
    # 1. Replace import
    content = content.replace(
        'import { db } from "./db.js";',
        'import { db, query, queryOne, run, exec } from "./db.js";'
    )
    
    # 2. Extract SQL from S object and remove it
    s_match = re.search(r'const S = \{([^}]+(?:\{[^}]*\}[^}]*)*)\};', content, re.DOTALL)
    if not s_match:
        # Try simpler pattern
        s_match = re.search(r'const S = \{[\s\S]+?\n\};', content)
    
    # Build SQL map from S object
    sql_map = {}
    s_block = s_match.group(0) if s_match else ""
    
    # Match: name: db.prepare("SQL"),
    for m in re.finditer(r'(\w+):\s*db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"', s_block):
        sql_map[m.group(1)] = m.group(2).replace('\\"', '"')
    for m in re.finditer(r"(\w+):\s*db\.prepare\(\s*\n?\s*'((?:[^'\\]|\\.)*)'", s_block):
        sql_map[m.group(1)] = m.group(2).replace("\\'", "'")
    
    # Also capture multi-line SQL in backticks
    for m in re.finditer(r'(\w+):\s*db\.prepare\(\s*\n\s*`([^`]+)`', s_block):
        sql_map[m.group(1)] = m.group(2).strip()
    
    print(f"  Found {len(sql_map)} prepared statements in S object")
    
    # Remove the entire S object
    if s_match:
        content = content[:s_match.start()] + content[s_match.end():]
    
    # 3. Replace S.xxx.get(args) → await queryOne(SQL, [args])
    for name, sql in sql_map.items():
        escaped_sql = sql.replace("'", "\\'")
        # S.name.get() → await queryOne("sql")
        content = re.sub(
            rf'S\.{name}\.get\(\)',
            f"await queryOne('{escaped_sql}')",
            content
        )
        # S.name.get(arg1, arg2) → await queryOne("sql", [arg1, arg2])
        content = re.sub(
            rf'S\.{name}\.get\(([^)]+)\)',
            f"await queryOne('{escaped_sql}', [\\1])",
            content
        )
        # S.name.all() → await query("sql")
        content = re.sub(
            rf'S\.{name}\.all\(\)',
            f"await query('{escaped_sql}')",
            content
        )
        # S.name.all(arg1, arg2) → await query("sql", [arg1, arg2])
        content = re.sub(
            rf'S\.{name}\.all\(([^)]+)\)',
            f"await query('{escaped_sql}', [\\1])",
            content
        )
        # S.name.run(arg1, arg2) → await run("sql", [arg1, arg2])
        content = re.sub(
            rf'S\.{name}\.run\(([^)]+)\)',
            f"await run('{escaped_sql}', [\\1])",
            content
        )
        # S.name.run() → await run("sql")
        content = re.sub(
            rf'S\.{name}\\.run\(\)',
            f"await run('{escaped_sql}')",
            content
        )
    
    # 4. Replace remaining db.prepare().xxx patterns
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.get\(([^)]*)\)',
        r"await queryOne('\1', [\2])",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.all\(([^)]*)\)',
        r"await query('\1', [\2])",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.run\(([^)]*)\)',
        r"await run('\1', [\2])",
        content
    )
    
    # Handle backtick SQL strings in db.prepare
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*`([^`]+)`\s*\)\.get\(([^)]*)\)',
        r"await queryOne(`\1`, [\2])",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*`([^`]+)`\s*\)\.all\(([^)]*)\)',
        r"await query(`\1`, [\2])",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*`([^`]+)`\s*\)\.run\(([^)]*)\)',
        r"await run(`\1`, [\2])",
        content
    )
    
    # 5. Replace db.exec() → await exec()
    content = re.sub(r'\bdb\.exec\(', 'await exec(', content)
    
    # 6. Remove db.pragma() calls
    content = re.sub(r'\bdb\.pragma\([^)]+\);?\n?', '', content)
    
    # 7. Replace db.transaction blocks
    content = re.sub(r'const tx = db\.transaction\(\(\) => \{', '// transaction:', content)
    content = re.sub(r'\}\);\s*\n\s*tx\(\);', '', content)
    
    # 8. Add async to all store methods
    # Match: methodName(args): ReturnType {
    content = re.sub(
        r'(\s+)(\w+)\(([^)]*)\)\s*:\s*(\{[^}]+\}|void|boolean|User|Conversation|Message|Friendship|FriendRequest|Conversation\[\]|Message\[\]|User\[\]|Friendship\[\]|FriendRequest\[\]|number|string)',
        r'\1async \2(\3): Promise<\4>',
        content
    )
    # Arrow functions: name: (...) => { ... }
    content = re.sub(
        r'(\s+)(\w+):\s*\(([^)]*)\)\s*=>\s*\{',
        r'\1async \2(\3) => {',
        content
    )
    
    # Fix: "async async" duplication
    content = content.replace('async async ', 'async ')
    
    # 9. Handle remaining S.xxx references that weren't caught
    content = re.sub(r'S\.(\w+)\.get\(([^)]*)\)', r"await queryOne('FIXME', [\\2]) /* S.\\1 */", content)
    content = re.sub(r'S\.(\w+)\.all\(([^)]*)\)', r"await query('FIXME', [\\2]) /* S.\\1 */", content)
    content = re.sub(r'S\.(\w+)\.run\(([^)]*)\)', r"await run('FIXME', [\\2]) /* S.\\1 */", content)
    
    # 10. Fix specific MySQL syntax issues
    # INSERT OR IGNORE → INSERT IGNORE
    content = content.replace('INSERT OR IGNORE INTO', 'INSERT IGNORE INTO')
    # INSERT OR REPLACE → REPLACE INTO
    content = content.replace('INSERT OR REPLACE INTO', 'REPLACE INTO')
    # ON CONFLICT ... DO UPDATE SET x = excluded.x → ON DUPLICATE KEY UPDATE x = VALUES(x)
    content = re.sub(
        r'ON CONFLICT\([^)]+\)\s*DO\s+UPDATE\s+SET\s+(\w+)\s*=\s*excluded\.(\w+)',
        r'ON DUPLICATE KEY UPDATE \1 = VALUES(\2)',
        content
    )
    content = re.sub(
        r'ON CONFLICT\([^)]+\)\s*DO\s+UPDATE\s+SET\s+(\w+)\s*=\s*excluded\.(\w+)\s*\|\s*([\w.]+)',
        r'ON DUPLICATE KEY UPDATE \1 = \1 | VALUES(\2)',
        content
    )
    
    write_file('store.ts', content)
    print("✓ store.ts transformed")

def transform_admin_ts():
    """Transform admin.ts from sync to async MySQL."""
    content = read_file('admin.ts')
    
    # Replace import
    content = content.replace(
        'import { db } from "./db.js";',
        'import { db, query, queryOne, run, exec } from "./db.js";'
    )
    
    # Replace all db.prepare().xxx patterns
    # db.prepare(SQL).get() → await queryOne(SQL)
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.get\(\)',
        r"await queryOne('\1')",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.get\(([^)]+)\)',
        r"await queryOne('\1', [\2])",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.all\(\)',
        r"await query('\1')",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.all\(([^)]+)\)',
        r"await query('\1', [\2])",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.run\(\)',
        r"await run('\1')",
        content
    )
    content = re.sub(
        r'db\.prepare\(\s*\n?\s*"((?:[^"\\]|\\.)*)"\s*\)\.run\(([^)]+)\)',
        r"await run('\1', [\2])",
        content
    )
    
    # Handle the dynamic query building in getAllUsers, getAllChannels, getAuditLogs
    # These build SQL dynamically with string concatenation
    # db.prepare(countQuery).get(...params) → await queryOne(countQuery, params)
    content = content.replace('.get(...params)', ', params)')
    content = content.replace('.all(...params, limit, offset)', ', [...params, limit, offset])')
    
    # db.exec → await exec
    content = re.sub(r'\bdb\.exec\(', 'await exec(', content)
    
    # db.pragma → remove
    content = re.sub(r'\bdb\.pragma\([^)]+\);?\n?', '', content)
    
    # db.transaction blocks
    content = re.sub(r'const tx = db\.transaction\(\(\) => \{', '// transaction:', content)
    content = re.sub(r'\}\);\s*\n\s*tx\(\);', '', content)
    
    # Add async to all exported functions
    content = re.sub(
        r'export function (\w+)\(',
        r'export async function \1(',
        content
    )
    # Fix double async
    content = content.replace('export async async function', 'export async function')
    
    # INSERT OR IGNORE → INSERT IGNORE
    content = content.replace('INSERT OR IGNORE INTO', 'INSERT IGNORE INTO')
    
    # Fix remaining .get()/.all()/.run() after the replacements
    # These are cases where db.prepare spans multiple lines
    content = re.sub(r'\.get\(\)', '', content)  # Remove trailing .get()
    
    write_file('admin.ts', content)
    print("✓ admin.ts transformed")

def transform_callers():
    """Add await before store.xxx() calls in http.ts, admin-routes.ts, ws.ts."""
    for fname in ['http.ts', 'admin-routes.ts', 'ws.ts']:
        content = read_file(fname)
        
        # Add await before store.xxx( calls (but not before already-awaited ones)
        content = re.sub(r'(?<!\bawait )store\.(\w+)\(', r'await store.\1(', content)
        # Fix double await
        content = content.replace('await await ', 'await ')
        
        # Add await before getAdminRole(), logAuditAction() etc from admin.ts
        # These are now async
        for func in ['getAdminRole', 'logAuditAction', 'getSystemSettings', 'updateSystemSettings',
                     'banUser', 'unbanUser', 'isUserBanned', 'getDashboardStats', 'getAllUsers',
                     'getAllChannels', 'getAuditLogs', 'deleteUser', 'deleteChannel', 'deleteMessage',
                     'createNotification', 'updateNotification', 'deleteNotification', 'getAllNotifications',
                     'getNotification', 'getNotificationsForUser', 'markNotificationRead',
                     'banChannel', 'unbanChannel', 'isChannelBanned', 'sendNotificationToUser',
                     'grantAdminRole', 'removeAdminRole', 'getUnreadNotificationCount']:
            # Only add await if not already awaited
            content = re.sub(
                rf'(?<!\bawait )(?<!\w){func}\(',
                f'await {func}(',
                content
            )
        
        # Fix double await
        content = content.replace('await await ', 'await ')
        
        # Add await before queryOne, query, run, exec calls in http.ts
        for func in ['queryOne', 'query', 'run', 'exec']:
            content = re.sub(
                rf'(?<!\bawait )(?<!\w){func}\(',
                f'await {func}(',
                content
            )
        content = content.replace('await await ', 'await ')
        
        # Make Express handlers async
        # Pattern: (req, res) => { ... }
        content = re.sub(r'\(req:\s*AuthedRequest,\s*res:\s*Response\)\s*=>\s*\{', 
                        '(req: AuthedRequest, res: Response) => async {', content)
        # _req pattern
        content = re.sub(r'\(_req:\s*AuthedRequest,\s*res:\s*Response\)\s*=>\s*\{', 
                        '(_req: AuthedRequest, res: Response) => async {', content)
        # (req, res) without AuthedRequest
        content = re.sub(r'\(req:\s*Request,\s*res:\s*Response\)\s*=>\s*\{',
                        '(req: Request, res: Response) => async {', content)
        # next pattern
        content = re.sub(r'\(req:\s*AuthedRequest,\s*res:\s*Response,\s*next:\s*NextFunction\)\s*=>\s*\{',
                        '(req: AuthedRequest, res: Response, next: NextFunction) => async {', content)
        # (req, res, next) without AuthedRequest  
        content = re.sub(r'\(req:\s*Request,\s*res:\s*Response,\s*next:\s*NextFunction\)\s*=>\s*\{',
                        '(req: Request, res: Response, next: NextFunction) => async {', content)
        
        # Fix double async
        content = content.replace('async async', 'async')
        
        write_file(fname, content)
        print(f"✓ {fname} transformed")

if __name__ == "__main__":
    os.chdir('/www/study_tool/server/src')
    print("=== MySQL Migration Codemod v2 ===\n")
    transform_db_ts()
    transform_config_ts()
    transform_store_ts()
    transform_admin_ts()
    transform_callers()
    print("\n=== Done ===")
    print("Run 'npm -w @navo/server run build' to check for errors.")
