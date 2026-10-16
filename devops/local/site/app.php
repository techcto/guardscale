<?php
declare(strict_types=1);
if (getenv('GUARDSCALE_LOCAL_FIXTURE') !== 'true') { http_response_code(404); exit; }
function h(mixed $value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function database(): PDO {
    static $db=null;
    if ($db instanceof PDO) return $db;
    $db=new PDO('sqlite:/var/lib/guardscale-demo/app.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout=3000'); $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price_cents INTEGER NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, total_cents INTEGER NOT NULL, created_at TEXT NOT NULL)');
    if ((int)$db->query('SELECT COUNT(*) FROM products')->fetchColumn()===0) {
        $insert=$db->prepare('INSERT OR IGNORE INTO products VALUES (?,?,?,?)');
        foreach ([[1,'Field notebook','Office',1200],[2,'Desk lamp','Office',2900],[3,'USB-C cable','Technology',1500],[4,'Travel mug','Travel',1800],[5,'Canvas bag','Travel',2400],[6,'Wireless mouse','Technology',3500]] as $row) $insert->execute($row);
    }
    if ((int)$db->query('SELECT COUNT(*) FROM articles')->fetchColumn()===0) {
        $insert=$db->prepare('INSERT OR IGNORE INTO articles VALUES (?,?,?)');
        foreach ([[1,'Welcome to the demo store','A disposable PHP application with a real SQLite database. No payments are collected.'],[2,'Behind a page request','Catalog search and form submissions execute actual SQL queries. The real GuardScale agent collects Apache and PHP logs.'],[3,'Review before responding','Unusual request patterns deserve investigation but do not prove an attack. Operators remain in control of temporary protection.']] as $row) $insert->execute($row);
    }
    return $db;
}
if (PHP_SAPI==='cli') { database(); echo "Local SQLite application initialized.\n"; exit; }
session_start(['cookie_httponly'=>true,'cookie_samesite'=>'Lax','use_strict_mode'=>true]);
$_SESSION['csrf']??=bin2hex(random_bytes(24)); $_SESSION['cart']??=[];
function csrf(): string { return '<input type="hidden" name="csrf" value="'.h($_SESSION['csrf']).'">'; }
function complete(string $page,string $message): never { $_SESSION['flash']=$message; header('Location: /?page='.$page,true,303); exit; }
