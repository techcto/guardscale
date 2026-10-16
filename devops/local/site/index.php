<?php
declare(strict_types=1);
require __DIR__.'/app.php';
header('X-GuardScale-Fixture: sqlite-php'); header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
$page=is_string($_GET['page']??null)?$_GET['page']:'home';
if (!in_array(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH),['/','/index.php'],true)) $page='not-found';
$titles=['home'=>'A small store. Real application traffic.','catalog'=>'Catalog','product'=>'Product details','articles'=>'Journal','article'=>'Article','contact'=>'Contact','cart'=>'Your cart','database'=>'Database status'];
$title=$titles[$page]??'Page not found'; $error=''; $databaseFailed=false; $selected=null; $products=[]; $articles=[];
try {
 $db=database();
 if ($page==='database'&&($_GET['format']??'')==='json') {
  header('Content-Type: application/json'); echo json_encode(['database'=>'sqlite','ready'=>$db->query('SELECT 1')->fetchColumn()==1,'products'=>(int)$db->query('SELECT COUNT(*) FROM products')->fetchColumn(),'orders'=>(int)$db->query('SELECT COUNT(*) FROM orders')->fetchColumn(),'messages'=>(int)$db->query('SELECT COUNT(*) FROM messages')->fetchColumn()]); exit;
 }
 if ($_SERVER['REQUEST_METHOD']==='POST') {
  if (!is_string($_POST['csrf']??null)||!hash_equals($_SESSION['csrf'],$_POST['csrf'])) { http_response_code(400); $error='The form expired. Reload and try again.'; }
  else {
   $action=$_POST['action']??'';
   if ($action==='contact') {
    $name=substr(trim((string)($_POST['name']??'')),0,80); $email=substr(trim((string)($_POST['email']??'')),0,254); $message=substr(trim((string)($_POST['message']??'')),0,1000);
    if (!$name||!filter_var($email,FILTER_VALIDATE_EMAIL)||!$message) $error='Enter your name, email and message.';
    else { $db->prepare('INSERT INTO messages (name,email,message,created_at) VALUES (?,?,?,?)')->execute([$name,$email,$message,gmdate('c')]); complete('contact','Message saved to the local database. No email was sent.'); }
   } elseif ($action==='add-cart') {
    $id=(int)($_POST['product_id']??0); $query=$db->prepare('SELECT id FROM products WHERE id=?'); $query->execute([$id]);
    if ($query->fetch()) { $_SESSION['cart'][$id]=min(5,($_SESSION['cart'][$id]??0)+1); complete('cart','Item added to your cart.'); } else $error='This product is unavailable.';
   } elseif ($action==='checkout') {
    $total=0; $db->beginTransaction();
    foreach ($_SESSION['cart'] as $id=>$quantity) { $query=$db->prepare('SELECT price_cents FROM products WHERE id=?'); $query->execute([(int)$id]); $price=$query->fetchColumn(); if ($price===false||$quantity<1||$quantity>5) throw new RuntimeException('Cart validation failed'); $total+=(int)$price*$quantity; }
    if (!$_SESSION['cart']) { $db->rollBack(); $error='Add an item before checking out.'; }
    else { $db->prepare('INSERT INTO orders (total_cents,created_at) VALUES (?,?)')->execute([$total,gmdate('c')]); $db->commit(); $_SESSION['cart']=[]; complete('cart','Demo order saved to SQLite. No payment was taken.'); }
   }
  }
 }
 $q=is_string($_GET['q']??null)?substr($_GET['q'],0,120):''; $category=is_string($_GET['category']??null)?substr($_GET['category'],0,40):'';
 $query=$db->prepare('SELECT * FROM products WHERE name LIKE ? AND (? = ? OR category = ?) ORDER BY id LIMIT 50'); $query->execute(['%'.$q.'%',$category,'',$category]); $products=$query->fetchAll();
 $articles=$db->query('SELECT id,title FROM articles ORDER BY id')->fetchAll();
 if ($page==='product'||$page==='article') { $query=$db->prepare($page==='product'?'SELECT * FROM products WHERE id=?':'SELECT * FROM articles WHERE id=?'); $query->execute([(int)($_GET['id']??0)]); $selected=$query->fetch(); if (!$selected) { http_response_code(404); $title='Page not found'; } }
 if (!isset($titles[$page])) http_response_code(404);
} catch (Throwable $exception) { $databaseFailed=true; if (isset($db)&&$db->inTransaction()) $db->rollBack(); error_log('Local application database error: '.$exception->getMessage()); http_response_code(503); $error='The database operation could not finish. Please try again.'; }
$flash=$_SESSION['flash']??''; unset($_SESSION['flash']);
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?= h($title) ?> · GuardScale Demo Store</title><link rel="stylesheet" href="/style.css"></head><body>
<header><a class="brand" href="/">GuardScale Demo Store</a><nav aria-label="Main navigation"><a href="/">Home</a><a href="/?page=catalog">Catalog</a><a href="/?page=articles">Journal</a><a href="/?page=contact">Contact</a><a href="/?page=cart">Cart (<?= array_sum($_SESSION['cart']) ?>)</a></nav></header>
<main><p class="eyebrow">Disposable PHP + Apache + SQLite application</p><h1><?= h($title) ?></h1>
<?php if ($flash): ?><p role="status" class="notice"><?= h($flash) ?></p><?php endif ?><?php if ($error): ?><p role="alert" class="error"><?= h($error) ?></p><?php endif ?>
<?php if (!$databaseFailed): ?>
<?php if ($page==='home'): ?><p class="intro">Browse products, search the catalog, read the journal, send a message and place a demo order. Pages use a real database connection; requests generate actual server logs.</p><p><a class="button" href="/?page=catalog">Browse the catalog →</a> <a href="/?page=database">Check database connection →</a></p><?php endif ?>
<?php if ($page==='home'||$page==='catalog'): ?>
<?php if ($page==='catalog'): ?><form class="search" method="get"><input type="hidden" name="page" value="catalog"><label>Search products<input name="q" value="<?= h($q) ?>" maxlength="120"></label><label>Category<select name="category"><option value="">All categories</option><?php foreach (['Office','Technology','Travel'] as $group): ?><option <?= $category===$group?'selected':'' ?>><?= h($group) ?></option><?php endforeach ?></select></label><button>Search</button></form><?php endif ?>
<div class="grid"><?php foreach ($products as $product): ?><article><p class="eyebrow"><?= h($product['category']) ?></p><h2><?= h($product['name']) ?></h2><p>$<?= number_format($product['price_cents']/100,2) ?></p><a href="/?page=product&amp;id=<?= (int)$product['id'] ?>">View product →</a></article><?php endforeach ?></div><?php if (!$products): ?><p>No products match your search.</p><?php endif ?>
<?php elseif ($page==='product'&&$selected): ?><article><h2><?= h($selected['name']) ?></h2><p><?= h($selected['category']) ?> · $<?= number_format($selected['price_cents']/100,2) ?></p><form method="post"><?= csrf() ?><input type="hidden" name="action" value="add-cart"><input type="hidden" name="product_id" value="<?= (int)$selected['id'] ?>"><button>Add to cart</button></form></article>
<?php elseif ($page==='articles'): ?><div class="grid"><?php foreach ($articles as $article): ?><article><h2><?= h($article['title']) ?></h2><a href="/?page=article&amp;id=<?= (int)$article['id'] ?>">Read article →</a></article><?php endforeach ?></div>
<?php elseif ($page==='article'&&$selected): ?><article><h2><?= h($selected['title']) ?></h2><p><?= h($selected['body']) ?></p></article>
<?php elseif ($page==='contact'): ?><p>Messages are stored locally. This fixture does not send email.</p><form method="post"><?= csrf() ?><input type="hidden" name="action" value="contact"><label>Name<input name="name" maxlength="80" required></label><label>Email<input name="email" type="email" maxlength="254" required></label><label>Message<textarea name="message" maxlength="1000" rows="4" required></textarea></label><button>Save message</button></form>
<?php elseif ($page==='cart'): ?><?php if ($_SESSION['cart']): ?><ul><?php foreach ($_SESSION['cart'] as $id=>$quantity): $query=$db->prepare('SELECT name FROM products WHERE id=?'); $query->execute([(int)$id]); ?><li><?= h($query->fetchColumn()) ?> × <?= (int)$quantity ?></li><?php endforeach ?></ul><form method="post"><?= csrf() ?><input type="hidden" name="action" value="checkout"><button>Place demo order</button></form><p>No payment information is collected.</p><?php else: ?><p>Your cart is empty.</p><?php endif ?>
<?php elseif ($page==='database'&&!$error): ?><article><h2>SQLite connection is healthy</h2><p>A real PDO connection and SQL queries are running.</p><dl><?php foreach (['products','articles','messages','orders'] as $table): ?><dt><?= h(ucfirst($table)) ?></dt><dd><?= (int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn() ?></dd><?php endforeach ?></dl><p>Prepared statements, WAL journaling and a bounded busy timeout are enabled. The database is outside the web root.</p></article>
<?php else: ?><p>This page is unavailable. Try the catalog or journal.</p><?php endif ?>
<?php endif ?>
</main><footer><p>Local fixture only · No real payments or outbound email</p><nav aria-label="Diagnostics"><a href="/?page=database">Database status</a><a href="/warning.php">PHP warning</a><a href="/forbidden">Apache denial</a><a href="/missing">Missing page</a></nav></footer></body></html>
