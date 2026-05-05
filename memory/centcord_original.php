<?php
// ╔══════════════════════════════════════════════════════════╗
//  CentCord — Chat complet · JSON DB · PHP 5.6+ · Sécurisé
// ╚══════════════════════════════════════════════════════════╝
define('ROOT', __DIR__);
define('DATA', ROOT.'/wt_data');
define('UPL',  ROOT.'/wt_uploads');

foreach(['wt_data','wt_uploads','wt_uploads/av','wt_uploads/bn','wt_uploads/ico','wt_uploads/msg'] as $d)
    if(!is_dir(ROOT.'/'.$d)) @mkdir(ROOT.'/'.$d, 0755, true);

if(!headers_sent()){
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('X-XSS-Protection: 1; mode=block');
}
if(session_status()===PHP_SESSION_NONE){
    @ini_set('session.cookie_httponly','1');
    @ini_set('session.cookie_samesite','Strict');
    @ini_set('session.use_strict_mode','1');
    @ini_set('session.cookie_secure', isset($_SERVER['HTTPS'])?'1':'0');
    @ini_set('session.gc_maxlifetime','86400');
    @ini_set('session.cookie_samesite','Strict');
    session_start();
}
if(empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));

// ── Security headers ─────────────────────────────────────────────
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self' data: blob: https://i.imgur.com https://media.giphy.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src * data: blob:; connect-src 'self' stun:stun.l.google.com stun:stun1.l.google.com;");

// Permissions
define('PV',   1);  define('PS',  2);   define('PM',   4);
define('PK',   8);  define('PB',  16);  define('PCH',  32);
define('PR',  64);  define('PPIN',128); define('PADM', 256);
define('PSRV',512); define('PMU', 1024);define('PALL', 2047);
define('PDEF', PV|PS|PPIN);

// ── JSON engine ──────────────────────────────────────────────
function jR($t){
    $f=DATA.'/'.$t.'.json';
    if(!file_exists($f)) return [];
    $c=file_get_contents($f);
    $d=json_decode($c?:'{}',true);
    return is_array($d)?$d:[];
}
function jW($t,$d){
    $f=DATA.'/'.$t.'.json';
    $tmp=$f.'.'.getmypid().'.'.mt_rand();
    if(file_put_contents($tmp,json_encode($d,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),LOCK_EX)!==false)
        return rename($tmp,$f);
    @unlink($tmp); return false;
}
function jID($t){$m=jR('_meta');$m[$t]=($m[$t]??0)+1;jW('_meta',$m);return $m[$t];}
function jNow(){return date('Y-m-d H:i:s');}
function jAll($t,$w=[]){
    $rows=jR($t); if(!$w) return array_values($rows);
    $r=[];
    foreach($rows as $row){
        $ok=true;
        foreach($w as $k=>$v) if(!isset($row[$k])||$row[$k]!=$v){$ok=false;break;}
        if($ok) $r[]=$row;
    }
    return $r;
}
function jOne($t,$w=[]){$a=jAll($t,$w);return $a?$a[0]:null;}
function jIns($t,$d){
    $rows=jR($t); $id=jID($t);
    $d['id']=$id;
    if(!array_key_exists('created_at',$d)) $d['created_at']=jNow();
    $rows[$id]=$d; jW($t,$rows); return $id;
}
function jUpd($t,$id,$d){
    $rows=jR($t);
    if(!isset($rows[$id])) return false;
    $rows[$id]=array_merge($rows[$id],$d);
    return jW($t,$rows);
}
function jDel($t,$id){
    $rows=jR($t);
    if(!isset($rows[$id])) return false;
    unset($rows[$id]); return jW($t,$rows);
}
function jDelW($t,$w){
    $rows=jR($t);
    foreach($rows as $id=>$row){
        $ok=true;
        foreach($w as $k=>$v) if(!isset($row[$k])||$row[$k]!=$v){$ok=false;break;}
        if($ok) unset($rows[$id]);
    }
    return jW($t,$rows);
}

// ── Helpers ──────────────────────────────────────────────────
function csrf(){return $_SESSION['csrf'];}
function verifyCsrf(){
    $t=$_POST['_csrf']??($_SERVER['HTTP_X_CSRF']??'');
    return isset($_SESSION['csrf'])&&hash_equals($_SESSION['csrf'],$t);
}
function esc($v){return htmlspecialchars((string)($v??''),ENT_QUOTES|ENT_HTML5,'UTF-8');}
function isAuth(){return !empty($_SESSION['uid']);}
function me(){return (int)($_SESSION['uid']??0);}
function isAjax(){return ($_SERVER['HTTP_X_REQUESTED_WITH']??'')==='XMLHttpRequest';}
function ok($d=[]){header('Content-Type: application/json;charset=utf-8');echo json_encode(['ok'=>true,'data'=>$d]);exit;}
function err($m,$c=400){http_response_code($c);header('Content-Type: application/json;charset=utf-8');echo json_encode(['ok'=>false,'error'=>$m]);exit;}
function rl($key,$max=20,$w=60){
    $k='rl_'.$key;
    if(empty($_SESSION[$k])||time()>$_SESSION[$k]['r']) $_SESSION[$k]=['c'=>0,'r'=>time()+$w];
    if(++$_SESSION[$k]['c']>$max){
        header('Retry-After: '.$w);
        err('Trop de requêtes — attends '.($w<60?$w.'s':ceil($w/60).'min').' avant de réessayer.',429);
    }
}
// Global rate limit per session (1000 req/min max)
function globalRl(){
    if(empty($_SESSION['grl'])||time()>$_SESSION['grl']['r']) $_SESSION['grl']=['c'=>0,'r'=>time()+60];
    if(++$_SESSION['grl']['c']>1000) err('Trop de requêtes globales.',429);
}
function perm($uid,$sid){
    $uid=(int)$uid; $sid=(int)$sid;
    if($uid<=0||$sid<=0) return 0;
    $s=jOne('servers',['id'=>$sid]);
    if(!$s) return 0;
    if($s['owner_id']==$uid) return PALL;
    // Check member (avoid privilege escalation via non-member)
    if(!jOne('server_members',['server_id'=>$sid,'user_id'=>$uid])) return 0;
    $mrs=jAll('member_roles',['server_id'=>$sid,'user_id'=>$uid]);
    $p=0;
    foreach($mrs as $mr){
        $r=jOne('roles',['id'=>(int)$mr['role_id']]);
        if($r&&$r['server_id']==$sid) $p|=(int)$r['permissions']; // Verify role belongs to server
    }
    return $p;
}
function can($uid,$sid,$p){$pp=perm($uid,$sid);return ($pp&PADM)||($pp&$p);}
function isMem($uid,$sid){return (bool)jOne('server_members',['server_id'=>(int)$sid,'user_id'=>(int)$uid]);}
function isOwner($uid,$sid){$s=jOne('servers',['id'=>(int)$sid]);return $s&&$s['owner_id']==$uid;}
function safe($v,$max=500){$s=trim((string)($v??''));return mb_strlen($s)>$max?mb_substr($s,0,$max):$s;}
function safeInt($v,$min=0,$max=PHP_INT_MAX){$i=(int)($v??0);return max($min,min($max,$i));}
function safeName($v,$max=100){return preg_replace("/[^a-zA-Z0-9\xC0-\xFF\s\-_\.]/","",mb_substr(trim((string)($v??"")),0,$max));}
function validateColor($c){return preg_match('/^#[0-9a-fA-F]{6}$/',(string)($c??''))?$c:'#4F6BF4';}
function isBanned($uid,$sid){return (bool)jOne('bans',['server_id'=>(int)$sid,'user_id'=>(int)$uid]);}
function auditLog($sid,$uid,$action,$detail=''){
    jIns('audit_log',['server_id'=>$sid,'user_id'=>$uid,'action'=>$action,'detail'=>$detail,'created_at'=>jNow()]);
}
function isChanMem($uid,$cid){
    $ch=jOne('channels',['id'=>(int)$cid]); if(!$ch) return false;
    return isMem($uid,$ch['server_id']);
}
function genCode($n=8){return strtoupper(substr(bin2hex(random_bytes(6)),0,$n));}
function genDisc(){return str_pad((string)random_int(1,9999),4,'0',STR_PAD_LEFT);}
function fmtDate($dt){
    $ts=strtotime($dt); if(!$ts) return $dt;
    if($ts>=strtotime('today'))     return "Aujourd'hui ".date('H:i',$ts);
    if($ts>=strtotime('yesterday')) return 'Hier '.date('H:i',$ts);
    return date('d/m/Y H:i',$ts);
}
function notif($to,$type,$txt,$ref=null){jIns('notifs',['user_id'=>$to,'type'=>$type,'text'=>$txt,'ref'=>$ref,'read'=>0]);}

// MODIFIÉ: validation réelle de l'image + dossier msg
function upload($f,$dir,$max=8388608){
    if(!isset($f['error'])||$f['error']!==0||$f['size']>$max) return false;
    $ext=strtolower(pathinfo($f['name'],PATHINFO_EXTENSION));
    if(!in_array($ext,['jpg','jpeg','png','gif','webp'])) return false;
    // Vérification que c'est bien une vraie image
    $info=@getimagesize($f['tmp_name']);
    if(!$info) return false;
    $name=bin2hex(random_bytes(14)).'.'.$ext;
    return move_uploaded_file($f['tmp_name'],UPL.'/'.$dir.'/'.$name)?$name:false;
}

function avUrl($av,$un){
    if($av&&file_exists(UPL.'/av/'.$av)) return 'wt_uploads/av/'.$av;
    $cols=['4F6BF4','6BCB77','FF6B6B','FFD93D','C77DFF','F4A261','43B8E6'];
    $c=$cols[abs(crc32($un))%count($cols)];
    $l=strtoupper(mb_substr($un,0,1));
    return 'data:image/svg+xml;base64,'.base64_encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">'.
        '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'.
        '<stop offset="0%" stop-color="#'.$c.'"/><stop offset="100%" stop-color="#333"/></linearGradient></defs>'.
        '<rect width="80" height="80" rx="40" fill="url(#g)"/>'.
        '<text x="40" y="54" font-size="36" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">'.$l.'</text></svg>'
    );
}
function srvIcon($ic,$n){
    if($ic&&file_exists(UPL.'/ico/'.$ic)) return 'wt_uploads/ico/'.$ic;
    $words=preg_split('/\s+/',trim($n)); $init='';
    foreach(array_slice($words,0,2) as $w) $init.=strtoupper(mb_substr($w,0,1));
    $cols=['4F6BF4','6BCB77','FF6B6B','FFD93D','C77DFF'];
    $c=$cols[abs(crc32($n))%count($cols)];
    return 'data:image/svg+xml;base64,'.base64_encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">'.
        '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'.
        '<stop offset="0%" stop-color="#'.$c.'"/><stop offset="100%" stop-color="#333"/></linearGradient></defs>'.
        '<rect width="48" height="48" rx="14" fill="url(#g)"/>'.
        '<text x="24" y="32" font-size="17" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">'.$init.'</text></svg>'
    );
}
function banUrl($b){if($b&&file_exists(UPL.'/bn/'.$b)) return 'wt_uploads/bn/'.$b; return null;}

// NOUVEAU: URL pour les pièces jointes de messages
function msgAttUrl($a){if($a&&file_exists(UPL.'/msg/'.$a)) return 'wt_uploads/msg/'.$a; return null;}

function parseMsg($t){
    $t=esc($t);
    $t=preg_replace('/```([\s\S]+?)```/','<pre><code>$1</code></pre>',$t);
    $t=preg_replace('/`([^`]+)`/','<code>$1</code>',$t);
    $t=preg_replace('/\*\*\*(.+?)\*\*\*/','<strong><em>$1</em></strong>',$t);
    $t=preg_replace('/\*\*(.+?)\*\*/','<strong>$1</strong>',$t);
    $t=preg_replace('/\*(.+?)\*/','<em>$1</em>',$t);
    $t=preg_replace('/__(.+?)__/','<u>$1</u>',$t);
    $t=preg_replace('/~~(.+?)~~/','<s>$1</s>',$t);
    $t=preg_replace('/^> (.+)/m','<blockquote>$1</blockquote>',$t);
    $t=preg_replace('/^### (.+)/m','<h4>$1</h4>',$t);
    $t=preg_replace('/^## (.+)/m','<h3>$1</h3>',$t);
    $t=preg_replace('/^# (.+)/m','<h2>$1</h2>',$t);
    $t=preg_replace('/@(\w+)/','<span class="mn">@$1</span>',$t);
    $t=preg_replace('/#(\w[\w-]*)/', '<span class="cmn">#$1</span>',$t);
    // Images (gif, png, jpg, webp, jpeg) → render as img
    $t=preg_replace('/(?<!["\'>])(https?:\/\/\S+\.(?:gif|png|jpg|jpeg|webp))(\?\S*)?(?=\s|$)/i','<div class="msg-img-inline"><img src="$1$2" loading="lazy" onclick="openLightbox(\'$1$2\')" style="max-width:400px;max-height:300px;border-radius:8px;cursor:zoom-in;margin-top:4px;display:block"></div>',$t);
    // Remaining URLs → links
    $t=preg_replace('/(?<!["\'>src=])(https?:\/\/[^\s<>"]+)(?![^<]*>)/','<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',$t);
    return nl2br($t);
}
function enrichMsg($msg,$meId){
    $u=jOne('users',['id'=>(int)$msg['author_id']]);
    if(!$u) $u=['username'=>'Inconnu','avatar'=>null,'accent_color'=>'#4F6BF4'];
    $msg['username']   = $u['username'];
    $msg['avatar_url'] = avUrl($u['avatar'],$u['username']);
    $msg['accent']     = $u['accent_color']??'#4F6BF4';
    // Get role color from server membership
    $ch=jOne('channels',['id'=>(int)($msg['channel_id']??0)]);
    if($ch){
        $sid=$ch['server_id'];
        $rm=jOne('server_members',['server_id'=>$sid,'user_id'=>(int)$msg['author_id']]);
        if($rm&&$rm['nickname']) $msg['nickname']=$rm['nickname'];
        // Find highest role with a color
        $mRoles=jAll('member_roles',['server_id'=>$sid,'user_id'=>(int)$msg['author_id']]);
        $topColor=null; $topPos=-1;
        foreach($mRoles as $mr){
            $role=jOne('roles',['id'=>(int)$mr['role_id']]);
            if($role&&$role['color']&&$role['color']!=='#8E9297'&&($role['position']??0)>$topPos){
                $topColor=$role['color']; $topPos=$role['position']??0;
            }
        }
        if($topColor) $msg['accent']=$topColor;
        // Also set display name (nickname or username)
        if(!isset($msg['nickname'])) $msg['display_name']=$u['username'];
        else $msg['display_name']=$msg['nickname'];
    } else {
        $msg['display_name']=$u['username'];
    }
    $msg['html']       = parseMsg($msg['content']??'');
    $msg['fmt']        = fmtDate($msg['created_at']);
    // NOUVEAU: inclure l'URL de la pièce jointe
    $msg['attachment_url'] = msgAttUrl($msg['attachment']??null);
    if(!empty($msg['reply_to'])){
        $rm=jOne('messages',['id'=>(int)$msg['reply_to']]);
        if($rm){$ru=jOne('users',['id'=>(int)$rm['author_id']]);$msg['reply_content']=$rm['content'];$msg['reply_user']=$ru?$ru['username']:'?';}
    }
    $rxs=jAll('reactions',['message_id'=>(int)$msg['id']]); $g=[];
    foreach($rxs as $rx){
        $e=$rx['emoji'];
        if(!isset($g[$e])) $g[$e]=['emoji'=>$e,'cnt'=>0,'me'=>0];
        $g[$e]['cnt']++;
        if($rx['user_id']==$meId) $g[$e]['me']=1;
    }
    $msg['reactions']=array_values($g);
    return $msg;
}

// NOUVEAU: Captcha mathématique anti-bot
function newCaptcha(){
    $a=random_int(2,15); $b=random_int(2,15);
    $ops=['+','-']; $op=$ops[array_rand($ops)];
    $ans=($op==='+') ? $a+$b : $a-$b;
    $_SESSION['captcha_ans']=$ans;
    $_SESSION['captcha_ts']=time();
    return "{$a} {$op} {$b} = ?";
}
function verifyCaptcha($v){
    if(!isset($_SESSION['captcha_ans'])) return false;
    if((time()-($_SESSION['captcha_ts']??0))>600) return false;
    $ok=(int)$v===(int)$_SESSION['captcha_ans'];
    if($ok){ unset($_SESSION['captcha_ans'],$_SESSION['captcha_ts']); }
    return $ok;
}

// ── API AJAX ─────────────────────────────────────────────────
if(isAjax()){
    header('Content-Type: application/json;charset=utf-8');
    $a=(string)($_GET['a']??'');
    $m=$_SERVER['REQUEST_METHOD'];
    if(in_array($m,['POST','DELETE','PATCH'])&&!verifyCsrf()) err('CSRF invalide',403);

    // Enforce AJAX + global rate limit
    if(!isAjax()&&($a!=='webhook.send')) err('Accès direct interdit',403);
    globalRl();

    if($a==='captcha.new'){ ok(['q'=>newCaptcha()]); }

    // ── AUTH ─────────────────────────────────────────────────
    if($a==='register'&&$m==='POST'){
        rl('reg',5,300);
        $un=trim($_POST['username']??''); $pw=$_POST['password']??''; $pw2=$_POST['password2']??'';
        if(!preg_match('/^[a-zA-Z0-9_\-\.]{2,32}$/',$un)) err('Pseudo invalide (2-32 car. alphanumériques)');
        if(strlen($pw)<6)  err('Mot de passe trop court (min 6 caractères)');
        if($pw!==$pw2)     err('Les mots de passe ne correspondent pas');
        if(!preg_match('/^[\p{L}\p{N}_\-\.]{2,32}$/u',$un)) err('Pseudo invalide (2-32 car., lettres, chiffres, _, -, .)');
        if(preg_match('/^(admin|system|centcord|root|mod|bot|official|support)$/i',$un)) err('Ce pseudo est réservé');
        // NOUVEAU: vérification captcha
        if(!verifyCaptcha($_POST['captcha']??'')) err('Code de vérification incorrect');
        if(jOne('users',['username'=>$un])) err('Pseudo déjà utilisé');
        $id=jIns('users',['username'=>$un,'discriminator'=>genDisc(),'password'=>password_hash($pw,PASSWORD_BCRYPT,['cost'=>11]),'avatar'=>null,'banner'=>null,'bio'=>'','pronouns'=>'','accent_color'=>'#4F6BF4','status'=>'online','custom_status'=>'','theme'=>'dark','is_admin'=>0,'last_seen'=>jNow()]);
        session_regenerate_id(true); $_SESSION['uid']=$id; ok(['username'=>$un]);
    }
    if($a==='login'&&$m==='POST'){
        rl('login',10,300);
        $un=trim($_POST['username']??''); $pw=$_POST['password']??'';
        $u=jOne('users',['username'=>$un]);
        if(!$u||!password_verify($pw,$u['password'])) err('Pseudo ou mot de passe incorrect');
        jUpd('users',$u['id'],['last_seen'=>jNow(),'status'=>'online']);
        session_regenerate_id(true); $_SESSION['uid']=(int)$u['id']; ok(['username'=>$u['username']]);
    }
    if($a==='logout'&&$m==='POST'){ if(isAuth()) jUpd('users',me(),['status'=>'offline']); $_SESSION=[]; session_destroy(); ok(); }
    if($a==='me'){
        if(!isAuth()) err('Non connecté',401);
        $u=jOne('users',['id'=>me()]); if(!$u) err('Introuvable',404);
        ok(['id'=>$u['id'],'username'=>$u['username'],'discriminator'=>$u['discriminator'],'avatar'=>avUrl($u['avatar'],$u['username']),'banner'=>banUrl($u['banner']??null),'bio'=>$u['bio']??'','pronouns'=>$u['pronouns']??'','accent_color'=>$u['accent_color']??'#4F6BF4','status'=>$u['status']??'online','custom_status'=>$u['custom_status']??'','theme'=>$u['theme']??'dark','is_admin'=>(bool)($u['is_admin']??0)]);
    }

    // ── SERVERS ──────────────────────────────────────────────
    if($a==='srv.list'){
        if(!isAuth()) err('Auth',401);
        $mems=jAll('server_members',['user_id'=>me()]); $list=[];
        foreach($mems as $mem){ $s=jOne('servers',['id'=>(int)$mem['server_id']]); if(!$s) continue; $s['icon_url']=srvIcon($s['icon']??null,$s['name']); $s['member_count']=count(jAll('server_members',['server_id'=>(int)$s['id']])); $list[]=$s; }
        ok($list);
    }
    if($a==='srv.get'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0); if(!isMem(me(),$sid)) err('Accès refusé',403);
        $s=jOne('servers',['id'=>$sid]); if(!$s) err('Introuvable',404);
        $s['icon_url']=srvIcon($s['icon']??null,$s['name']);
        $cats=jAll('categories',['server_id'=>$sid]); usort($cats,fn($a,$b)=>$a['position']-$b['position']);
        foreach($cats as &$cat){ $chs=jAll('channels',['server_id'=>$sid,'category_id'=>$cat['id']]); usort($chs,fn($a,$b)=>$a['position']-$b['position']); $cat['channels']=$chs; }
        $s['categories']=$cats;
        $rawM=jAll('server_members',['server_id'=>$sid]); $members=[];
        foreach($rawM as $rm){
            $u=jOne('users',['id'=>(int)$rm['user_id']]); if(!$u) continue;
            $mRoles=jAll('member_roles',['server_id'=>$sid,'user_id'=>(int)$u['id']]);
            $rnames=[]; $rcolors=[]; $maxPos=0;
            foreach($mRoles as $mr){ $r=jOne('roles',['id'=>(int)$mr['role_id']]); if($r){ $rnames[]=$r['name']; $rcolors[]=$r['color']; if($r['position']>$maxPos) $maxPos=$r['position']; } }
            $members[]=['id'=>$u['id'],'username'=>$u['username'],'discriminator'=>$u['discriminator'],'avatar_url'=>avUrl($u['avatar'],$u['username']),'accent_color'=>$u['accent_color']??'#4F6BF4','status'=>$u['status']??'online','custom_status'=>$u['custom_status']??'','nickname'=>$rm['nickname']??null,'is_owner'=>($s['owner_id']==$u['id']),'role_names'=>implode(',',$rnames),'role_colors'=>implode(',',$rcolors),'max_pos'=>$maxPos,'is_muted'=>$rm['is_muted']??0];
        }
        usort($members,fn($a,$b)=>$b['max_pos']-$a['max_pos']);
        $s['members']=$members; $s['roles']=jAll('roles',['server_id'=>$sid]); $s['is_owner']=isOwner(me(),$sid); $s['permissions']=perm(me(),$sid);
        ok($s);
    }
    if($a==='srv.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); rl('srvcr_'.me(),5,600);
        // Max 10 servers owned per user
        $ownedCount=count(array_filter(jR('servers'),fn($s)=>$s['owner_id']==me()));
        if($ownedCount>=10) err('Tu peux posséder au maximum 10 serveurs.');
        $name=trim($_POST['name']??''); $desc=substr(trim($_POST['description']??''),0,300);
        $color=preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['color']??'')?$_POST['color']:'#4F6BF4';
        if(strlen($name)<2||strlen($name)>100) err('Nom 2-100 caractères');
        $code=genCode(); $oid=me();
        $sid=jIns('servers',['name'=>$name,'description'=>$desc,'color'=>$color,'icon'=>null,'banner'=>null,'owner_id'=>$oid,'invite_code'=>$code,'is_public'=>1]);
        if(!empty($_FILES['icon'])&&$_FILES['icon']['error']===0){ $fn=upload($_FILES['icon'],'ico'); if($fn) jUpd('servers',$sid,['icon'=>$fn]); }
        jIns('roles',['server_id'=>$sid,'name'=>'@everyone','color'=>'#8E9297','permissions'=>PDEF,'hoist'=>0,'position'=>0,'mentionable'=>1]);
        jIns('roles',['server_id'=>$sid,'name'=>'Modérateur','color'=>'#3BA55D','permissions'=>PDEF|PM|PK|PPIN|PMU,'hoist'=>1,'position'=>10,'mentionable'=>1]);
        $admId=jIns('roles',['server_id'=>$sid,'name'=>'Administrateur','color'=>'#ED4245','permissions'=>PALL,'hoist'=>1,'position'=>20,'mentionable'=>1]);
        $c1=jIns('categories',['server_id'=>$sid,'name'=>'INFORMATIONS','position'=>0]);
        jIns('channels',['server_id'=>$sid,'category_id'=>$c1,'name'=>'règles','type'=>'text','topic'=>'Règles du serveur','emoji'=>'📜','color'=>null,'slowmode'=>0,'nsfw'=>0,'position'=>0,'locked'=>1]);
        jIns('channels',['server_id'=>$sid,'category_id'=>$c1,'name'=>'annonces','type'=>'announcement','topic'=>'Annonces officielles','emoji'=>'📢','color'=>null,'slowmode'=>0,'nsfw'=>0,'position'=>1,'locked'=>0]);
        $c2=jIns('categories',['server_id'=>$sid,'name'=>'SALONS TEXTE','position'=>1]);
        $genCh=jIns('channels',['server_id'=>$sid,'category_id'=>$c2,'name'=>'général','type'=>'text','topic'=>'Discussion générale','emoji'=>'💬','color'=>null,'slowmode'=>0,'nsfw'=>0,'position'=>0,'locked'=>0]);
        jIns('channels',['server_id'=>$sid,'category_id'=>$c2,'name'=>'off-topic','type'=>'text','topic'=>'Discussions libres','emoji'=>'🎲','color'=>null,'slowmode'=>0,'nsfw'=>0,'position'=>1,'locked'=>0]);
        jIns('channels',['server_id'=>$sid,'category_id'=>$c2,'name'=>'médias','type'=>'text','topic'=>"Partage d'images et médias",'emoji'=>'🖼️','color'=>null,'slowmode'=>5,'nsfw'=>0,'position'=>2,'locked'=>0]);
        jIns('server_members',['server_id'=>$sid,'user_id'=>$oid,'nickname'=>null,'is_muted'=>0,'joined_at'=>jNow()]);
        jIns('member_roles',['server_id'=>$sid,'user_id'=>$oid,'role_id'=>$admId]);
        jIns('messages',['channel_id'=>$genCh,'author_id'=>0,'content'=>"🎉 Bienvenue sur **{$name}** ! Ce serveur vient d'être créé.",'type'=>'system','reply_to'=>null,'pinned'=>0,'deleted'=>0,'edited_at'=>null,'attachment'=>null]);
        ok(['id'=>$sid,'name'=>$name,'invite_code'=>$code]);
    }
    if($a==='srv.update'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0);
        if(!can(me(),$sid,PSRV)) err('Permission refusée',403);
        $sets=[];
        if(isset($_POST['name'])&&trim($_POST['name'])) $sets['name']=substr(trim($_POST['name']),0,100);
        if(isset($_POST['description'])) $sets['description']=substr(trim($_POST['description']),0,300);
        if(isset($_POST['color'])&&preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['color'])) $sets['color']=$_POST['color'];
        if(isset($_POST['is_public'])) $sets['is_public']=(int)(bool)$_POST['is_public'];
        if(!empty($_FILES['icon'])&&$_FILES['icon']['error']===0){ $fn=upload($_FILES['icon'],'ico'); if($fn) $sets['icon']=$fn; }
        if(!empty($_FILES['banner'])&&$_FILES['banner']['error']===0){ $fn=upload($_FILES['banner'],'bn'); if($fn) $sets['banner']=$fn; }
        if($sets) jUpd('servers',$sid,$sets); ok();
    }
    if($a==='srv.join'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $code=strtoupper(trim($_POST['code']??'')); $s=jOne('servers',['invite_code'=>$code]);
        if(!$s) err('Code invalide ou expiré');
        if(jOne('bans',['server_id'=>(int)$s['id'],'user_id'=>me()])) err('Tu es banni de ce serveur');
        if(!jOne('server_members',['server_id'=>(int)$s['id'],'user_id'=>me()]))
            jIns('server_members',['server_id'=>(int)$s['id'],'user_id'=>me(),'nickname'=>null,'is_muted'=>0,'joined_at'=>jNow()]);
        ok(['id'=>$s['id'],'name'=>$s['name']]);
    }
    if($a==='srv.regen'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0);
        if(!can(me(),$sid,PSRV)) err('Permission refusée',403);
        $code=genCode(); jUpd('servers',$sid,['invite_code'=>$code]); ok(['invite_code'=>$code]);
    }
    if($a==='srv.leave'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0);
        if(isOwner(me(),$sid)) err('Le propriétaire ne peut pas quitter');
        jDelW('server_members',['server_id'=>$sid,'user_id'=>me()]); ok();
    }
    if($a==='srv.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0);
        if(!isOwner(me(),$sid)) err('Accès refusé',403);
        // Delete all messages in all channels
        $cids=array_column(jAll('channels',['server_id'=>$sid]),'id');
        foreach($cids as $cid){ jDelW('messages',['channel_id'=>$cid]); }
        foreach(['server_members','categories','channels','roles','member_roles','bans','boosts','custom_emojis','stickers','audit_log','invites','webhooks','voice_states'] as $t) jDelW($t,['server_id'=>$sid]);
        jDel('servers',$sid); ok();
    }

    // ── CATEGORIES ───────────────────────────────────────────
    if($a==='cat.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0);
        if(!can(me(),$sid,PCH)) err('Permission refusée',403);
        $name=strtoupper(trim($_POST['name']??'')); if(!$name||strlen($name)>100) err('Nom requis');
        ok(['id'=>jIns('categories',['server_id'=>$sid,'name'=>$name,'position'=>count(jAll('categories',['server_id'=>$sid]))]),'name'=>$name]);
    }
    if($a==='cat.update'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_POST['cid']??0);
        $cat=jOne('categories',['id'=>$cid]); if(!$cat) err('Introuvable',404);
        if(!can(me(),$cat['server_id'],PCH)) err('Permission refusée',403);
        $name=strtoupper(trim($_POST['name']??'')); if($name) jUpd('categories',$cid,['name'=>$name]); ok();
    }
    if($a==='cat.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_POST['cid']??0);
        $cat=jOne('categories',['id'=>$cid]); if(!$cat) err('Introuvable',404);
        if(!can(me(),$cat['server_id'],PCH)) err('Permission refusée',403);
        foreach(jAll('channels',['category_id'=>$cid]) as $ch) jUpd('channels',$ch['id'],['category_id'=>null]);
        jDel('categories',$cid); ok();
    }

    // ── CHANNELS ─────────────────────────────────────────────
    if($a==='ch.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $_sid=safeInt($_POST['sid']??0);
        $chCount=count(jAll('channels',['server_id'=>$_sid]));
        if($chCount>=200) err('Limite de 200 salons par serveur atteinte.'); $sid=(int)($_POST['sid']??0);
        if(!can(me(),$sid,PCH)) err('Permission refusée',403);
        $name=strtolower(preg_replace('/\s+/','-',preg_replace('/[^a-zA-Z0-9\-_ ]/','',trim($_POST['name']??''))));
        $type=in_array($_POST['type']??'',['text','announcement','forum','voice'])?$_POST['type']:'text';
        $catId=!empty($_POST['cat_id'])?(int)$_POST['cat_id']:null;
        $topic=substr(trim($_POST['topic']??''),0,500);
        $emoji=mb_substr(trim($_POST['emoji']??''),0,4)?:null;
        $color=preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['color']??'')?$_POST['color']:null;
        $slow=min(max((int)($_POST['slowmode']??0),0),21600);
        $nsfw=(int)(bool)($_POST['nsfw']??0); $locked=(int)(bool)($_POST['locked']??0);
        if(!$name||strlen($name)>100) err('Nom de salon invalide');
        if(jOne('channels',['server_id'=>$sid,'name'=>$name])) err('Un salon avec ce nom existe déjà');
        $id=jIns('channels',['server_id'=>$sid,'category_id'=>$catId,'name'=>$name,'type'=>$type,'topic'=>$topic,'emoji'=>$emoji,'color'=>$color,'slowmode'=>$slow,'nsfw'=>$nsfw,'locked'=>$locked,'position'=>count(jAll('channels',['server_id'=>$sid]))]);
        ok(['id'=>$id,'name'=>$name,'type'=>$type,'emoji'=>$emoji,'color'=>$color]);
    }
    if($a==='ch.update'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_POST['cid']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch) err('Introuvable',404);
        if(!can(me(),$ch['server_id'],PCH)) err('Permission refusée',403);
        $sets=[];
        if(isset($_POST['name'])){$n=strtolower(preg_replace('/\s+/','-',preg_replace('/[^a-zA-Z0-9\-_ ]/','',trim($_POST['name']))));if($n) $sets['name']=$n;}
        if(isset($_POST['topic']))    $sets['topic']=substr(trim($_POST['topic']),0,500);
        if(isset($_POST['emoji']))    $sets['emoji']=mb_substr(trim($_POST['emoji']),0,4)?:null;
        if(isset($_POST['color']))    $sets['color']=preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['color'])?$_POST['color']:null;
        if(isset($_POST['slowmode'])) $sets['slowmode']=min(max((int)$_POST['slowmode'],0),21600);
        if(isset($_POST['nsfw']))     $sets['nsfw']=(int)(bool)$_POST['nsfw'];
        if(isset($_POST['locked']))   $sets['locked']=(int)(bool)$_POST['locked'];
        if(isset($_POST['cat_id']))   $sets['category_id']=!empty($_POST['cat_id'])?(int)$_POST['cat_id']:null;
        if(isset($_POST['type'])&&in_array($_POST['type'],['text','announcement','forum','voice'])) $sets['type']=$_POST['type'];
        if($sets) jUpd('channels',$cid,$sets); ok();
    }
    if($a==='ch.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_POST['cid']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch) err('Introuvable',404);
        if(!can(me(),$ch['server_id'],PCH)) err('Permission refusée',403);
        jDel('channels',$cid); ok();
    }

    // ── MESSAGES ─────────────────────────────────────────────
    if($a==='msg.list'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_GET['cid']??0); $before=(int)($_GET['before']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch||!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        $all=jAll('messages',['channel_id'=>$cid,'deleted'=>0]); usort($all,fn($a,$b)=>$a['id']-$b['id']);
        if($before>0) $all=array_values(array_filter($all,fn($mm)=>$mm['id']<$before));
        ok(array_map(fn($mm)=>enrichMsg($mm,me()),array_slice($all,-50)));
    }
    if($a==='msg.send'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        rl('msg_'.me(),30,10); // 30 messages per 10s rl('msg_'.me(),25,10);
        $cid=(int)($_POST['cid']??0); $content=trim($_POST['content']??''); $replyTo=!empty($_POST['reply_to'])?(int)$_POST['reply_to']:null;
        $ch=jOne('channels',['id'=>$cid]); if(!$ch||!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        if(($ch['locked']??0)&&!can(me(),$ch['server_id'],PCH)) err('Salon verrouillé 🔒',403);
        if(!can(me(),$ch['server_id'],PS)) err('Permission refusée',403);
        // MODIFIÉ: accepte message vide si fichier présent
        $hasFile=!empty($_FILES['file'])&&$_FILES['file']['error']===0;
        if(empty($content)&&!$hasFile) err('Message vide');
        if(!empty($content)&&strlen($content)>4000) err('Trop long (max 4000 car.)');
        if(($ch['slowmode']??0)>0){ $last=jOne('messages',['channel_id'=>$cid,'author_id'=>me()]); if($last&&(time()-strtotime($last['created_at']))<$ch['slowmode']) err('Slowmode actif, attends encore '.($ch['slowmode']-(time()-strtotime($last['created_at']))).'s'); }
        $mid=jIns('messages',['channel_id'=>$cid,'author_id'=>me(),'content'=>$content,'type'=>'default','reply_to'=>$replyTo,'pinned'=>0,'deleted'=>0,'edited_at'=>null,'attachment'=>null]);
        // MODIFIÉ: upload de fichier image dans wt_uploads/msg/
        if($hasFile){
            $fn=upload($_FILES['file'],'msg',16777216); // 16 Mo max
            if($fn) jUpd('messages',$mid,['attachment'=>$fn]);
            else { jDel('messages',$mid); err('Image invalide. Formats acceptés: JPG, PNG, GIF, WEBP (max 16 Mo)'); }
        }
        preg_match_all('/@(\w+)/',$content,$ments);
        foreach($ments[1] as $mn){ $mu=jOne('users',['username'=>$mn]); if($mu&&$mu['id']!=me()){ $me2=jOne('users',['id'=>me()]); notif($mu['id'],'mention','@'.$me2['username'].' t\'a mentionné dans #'.$ch['name'],$mid); } }
        jDelW('typing',['channel_id'=>$cid,'user_id'=>me()]);
        ok(enrichMsg(jOne('messages',['id'=>$mid]),me()));
    }
    if($a==='msg.edit'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $mid=(int)($_POST['mid']??0); $content=trim($_POST['content']??'');
        $msg=jOne('messages',['id'=>$mid,'deleted'=>0]); if(!$msg) err('Introuvable',404);
        if($msg['author_id']!=me()) err('Accès refusé',403);
        if(empty($content)||strlen($content)>4000) err('Contenu invalide');
        jUpd('messages',$mid,['content'=>$content,'edited_at'=>jNow()]); ok(['html'=>parseMsg($content),'content'=>$content]);
    }
    if($a==='msg.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $mid=(int)($_POST['mid']??0);
        $msg=jOne('messages',['id'=>$mid]); if(!$msg) err('Introuvable',404);
        $ch=jOne('channels',['id'=>(int)$msg['channel_id']]);
        if($msg['author_id']!=me()&&(!$ch||!can(me(),$ch['server_id'],PM))) err('Accès refusé',403);
        jUpd('messages',$mid,['deleted'=>1]); ok();
    }
    if($a==='msg.pin'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $mid=(int)($_POST['mid']??0);
        $msg=jOne('messages',['id'=>$mid]); if(!$msg) err('Introuvable',404);
        $ch=jOne('channels',['id'=>(int)$msg['channel_id']]);
        if(!$ch||!can(me(),$ch['server_id'],PPIN)) err('Permission refusée',403);
        $np=$msg['pinned']?0:1; jUpd('messages',$mid,['pinned'=>$np]); ok(['pinned'=>$np]);
    }
    if($a==='msg.poll'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_GET['cid']??0); $last=(int)($_GET['last']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch||!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        $all=jAll('messages',['channel_id'=>$cid,'deleted'=>0]);
        $new=array_values(array_filter($all,fn($mm)=>$mm['id']>$last));
        usort($new,fn($a,$b)=>$a['id']-$b['id']);
        ok(array_map(fn($mm)=>enrichMsg($mm,me()),array_slice($new,0,30)));
    }
    if($a==='msg.pins'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_GET['cid']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch||!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        $pins=jAll('messages',['channel_id'=>$cid,'pinned'=>1,'deleted'=>0]);
        usort($pins,fn($a,$b)=>$b['id']-$a['id']);
        ok(array_map(fn($mm)=>enrichMsg($mm,me()),array_slice($pins,0,50)));
    }

    // ── REACTIONS ─────────────────────────────────────────────
    if($a==='react'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $mid=(int)($_POST['mid']??0); $emoji=trim($_POST['emoji']??'');
        $oke=['👍','👎','❤️','🔥','😂','😮','😢','🎉','✅','🚀','💯','🤔','👏','🙏','😎','💀','🫡','⭐','💎','🎯'];
        if(!in_array($emoji,$oke)) err('Emoji non autorisé');
        $ex=jOne('reactions',['message_id'=>$mid,'user_id'=>me(),'emoji'=>$emoji]);
        if($ex){ jDel('reactions',$ex['id']); $added=false; }
        else { jIns('reactions',['message_id'=>$mid,'user_id'=>me(),'emoji'=>$emoji]); $added=true; }
        ok(['added'=>$added,'count'=>count(jAll('reactions',['message_id'=>$mid,'emoji'=>$emoji]))]);
    }

    // ── TYPING ───────────────────────────────────────────────
    if($a==='typing.start'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_POST['cid']??0);
        jDelW('typing',['channel_id'=>$cid,'user_id'=>me()]);
        jIns('typing',['channel_id'=>$cid,'user_id'=>me(),'ts'=>jNow()]);
        $all=jR('typing'); $thr=time()-10;
        foreach($all as $k=>$t){ if(strtotime($t['ts'])<$thr) unset($all[$k]); } jW('typing',$all); ok();
    }
    if($a==='typing.list'){
        if(!isAuth()) err('Auth',401); $cid=(int)($_GET['cid']??0);
        $all=jAll('typing',['channel_id'=>$cid]); $thr=time()-10; $names=[];
        foreach($all as $t){ if($t['user_id']!=me()&&strtotime($t['ts'])>=$thr){ $u=jOne('users',['id'=>(int)$t['user_id']]); if($u) $names[]=$u['username']; } }
        ok($names);
    }

    // ── FRIENDS ──────────────────────────────────────────────
    if($a==='friends.list'){
        if(!isAuth()) err('Auth',401); $me=me(); $all=jR('friends'); $list=[];
        foreach($all as $f){
            if(($f['requester_id']==$me||$f['addressee_id']==$me)&&$f['status']!=='blocked'){
                $oid=($f['requester_id']==$me)?$f['addressee_id']:$f['requester_id'];
                $u=jOne('users',['id'=>(int)$oid]); if(!$u) continue;
                $f['username']=$u['username']; $f['avatar_url']=avUrl($u['avatar'],$u['username']);
                $f['status_str']=$u['status']??'offline'; $f['custom_status']=$u['custom_status']??'';
                $f['accent_color']=$u['accent_color']??'#4F6BF4';
                $f['is_incoming']=($f['addressee_id']==$me&&$f['status']==='pending'); $f['other_id']=$oid; $list[]=$f;
            }
        }
        ok($list);
    }
    if($a==='friends.blocked'){
        if(!isAuth()) err('Auth',401); $me=me(); $all=jR('friends'); $list=[];
        foreach($all as $f){ if($f['requester_id']==$me&&$f['status']==='blocked'){ $u=jOne('users',['id'=>(int)$f['addressee_id']]); if($u){ $f['username']=$u['username']; $f['avatar_url']=avUrl($u['avatar'],$u['username']); $list[]=$f; } } }
        ok($list);
    }
    if($a==='friends.send'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); rl('fr_'.me(),10,300);
        $tid=(int)($_POST['tid']??0); if($tid===me()) err("Tu ne peux pas t'ajouter toi-même");
        if(!jOne('users',['id'=>$tid])) err('Utilisateur introuvable',404);
        $ex=jR('friends'); foreach($ex as $f){ if(($f['requester_id']==$tid&&$f['addressee_id']==me())||($f['requester_id']==me()&&$f['addressee_id']==$tid)) err('Relation déjà existante'); }
        jIns('friends',['requester_id'=>me(),'addressee_id'=>$tid,'status'=>'pending']);
        $me2=jOne('users',['id'=>me()]); notif($tid,'friend_request',$me2['username']." t'a envoyé une demande d'ami",me()); ok();
    }
    if($a==='friends.accept'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $fid=(int)($_POST['fid']??0);
        $f=jOne('friends',['id'=>$fid]); if(!$f||$f['addressee_id']!=me()) err('Introuvable',404);
        jUpd('friends',$fid,['status'=>'accepted']); ok();
    }
    if($a==='friends.remove'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $fid=(int)($_POST['fid']??0);
        $f=jOne('friends',['id'=>$fid]); if(!$f) err('Introuvable',404);
        if($f['requester_id']!=me()&&$f['addressee_id']!=me()) err('Accès refusé',403);
        jDel('friends',$fid); ok();
    }
    if($a==='friends.block'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $tid=(int)($_POST['tid']??0);
        $all=jR('friends');
        foreach($all as $f){ if(($f['requester_id']==me()&&$f['addressee_id']==$tid)||($f['requester_id']==$tid&&$f['addressee_id']==me())) jDel('friends',$f['id']); }
        jIns('friends',['requester_id'=>me(),'addressee_id'=>$tid,'status'=>'blocked']); ok();
    }

    // ── DMs ──────────────────────────────────────────────────
    if($a==='dm.open'){
        if(!isAuth()) err('Auth',401); $tid=(int)($_GET['tid']??0); $me=me(); $u1=min($me,$tid); $u2=max($me,$tid);
        $dm=jOne('direct_messages',['user1_id'=>$u1,'user2_id'=>$u2]);
        if(!$dm){ $dmId=jIns('direct_messages',['user1_id'=>$u1,'user2_id'=>$u2]); $dm=['id'=>$dmId]; } ok($dm);
    }
    if($a==='dm.messages'){
        if(!isAuth()) err('Auth',401); $dmId=(int)($_GET['dmid']??0); $me=me();
        $dm=jOne('direct_messages',['id'=>$dmId]); if(!$dm||($dm['user1_id']!=$me&&$dm['user2_id']!=$me)) err('Accès refusé',403);
        $msgs=jAll('dm_messages',['dm_id'=>$dmId,'deleted'=>0]); usort($msgs,fn($a,$b)=>$a['id']-$b['id']); $msgs=array_slice($msgs,-50);
        ok(array_map(function($mm){ $u=jOne('users',['id'=>(int)$mm['author_id']]); if(!$u) $u=['username'=>'?','avatar'=>null]; $mm['username']=$u['username']; $mm['avatar_url']=avUrl($u['avatar'],$u['username']); $mm['html']=parseMsg($mm['content']); $mm['fmt']=fmtDate($mm['created_at']); return $mm; },$msgs));
    }
    if($a==='dm.send'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); rl('dm_'.me(),30,10);
        $dmId=(int)($_POST['dmid']??0); $content=trim($_POST['content']??''); $me=me();
        $dm=jOne('direct_messages',['id'=>$dmId]); if(!$dm||($dm['user1_id']!=$me&&$dm['user2_id']!=$me)) err('Accès refusé',403);
        if(empty($content)||strlen($content)>4000) err('Contenu invalide');
        $mid=jIns('dm_messages',['dm_id'=>$dmId,'author_id'=>$me,'content'=>$content,'deleted'=>0,'edited_at'=>null]);
        $otherId=($dm['user1_id']==$me)?$dm['user2_id']:$dm['user1_id'];
        $u=jOne('users',['id'=>$me]); notif($otherId,'dm',$u['username']." t'a envoyé un message",$dmId);
        $msg=jOne('dm_messages',['id'=>$mid]); $msg['username']=$u['username']; $msg['avatar_url']=avUrl($u['avatar'],$u['username']); $msg['html']=parseMsg($msg['content']); $msg['fmt']="À l'instant"; ok($msg);
    }
    if($a==='dm.poll'){
        if(!isAuth()) err('Auth',401); $dmId=(int)($_GET['dmid']??0); $last=(int)($_GET['last']??0); $me=me();
        $dm=jOne('direct_messages',['id'=>$dmId]); if(!$dm||($dm['user1_id']!=$me&&$dm['user2_id']!=$me)) err('Accès refusé',403);
        $all=jAll('dm_messages',['dm_id'=>$dmId,'deleted'=>0]);
        $new=array_values(array_filter($all,fn($mm)=>$mm['id']>$last)); usort($new,fn($a,$b)=>$a['id']-$b['id']);
        ok(array_map(function($mm){ $u=jOne('users',['id'=>(int)$mm['author_id']]); if(!$u) $u=['username'=>'?','avatar'=>null]; $mm['username']=$u['username']; $mm['avatar_url']=avUrl($u['avatar'],$u['username']); $mm['html']=parseMsg($mm['content']); $mm['fmt']=fmtDate($mm['created_at']); return $mm; },array_slice($new,0,30)));
    }

    // ── ROLES ────────────────────────────────────────────────
    if($a==='role.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0);
        if(!can(me(),$sid,PR)) err('Permission refusée',403);
        $name=trim($_POST['name']??''); $color=preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['color']??'')?$_POST['color']:'#8E9297';
        $perms=(int)($_POST['permissions']??PDEF); $hoist=(int)(bool)($_POST['hoist']??0); $ment=(int)(bool)($_POST['mentionable']??1);
        if(!$name||strlen($name)>50) err('Nom requis');
        ok(['id'=>jIns('roles',['server_id'=>$sid,'name'=>$name,'color'=>$color,'permissions'=>$perms,'hoist'=>$hoist,'position'=>5,'mentionable'=>$ment]),'name'=>$name,'color'=>$color]);
    }
    if($a==='role.update'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $rid=(int)($_POST['rid']??0);
        $r=jOne('roles',['id'=>$rid]); if(!$r) err('Introuvable',404);
        if(!can(me(),$r['server_id'],PR)) err('Permission refusée',403);
        $sets=[];
        if(isset($_POST['name'])&&trim($_POST['name'])) $sets['name']=substr(trim($_POST['name']),0,50);
        if(isset($_POST['color'])&&preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['color'])) $sets['color']=$_POST['color'];
        if(isset($_POST['permissions'])) $sets['permissions']=(int)$_POST['permissions'];
        if(isset($_POST['hoist']))       $sets['hoist']=(int)(bool)$_POST['hoist'];
        if(isset($_POST['mentionable'])) $sets['mentionable']=(int)(bool)$_POST['mentionable'];
        if($sets) jUpd('roles',$rid,$sets); ok();
    }
    if($a==='role.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $rid=(int)($_POST['rid']??0);
        $r=jOne('roles',['id'=>$rid]); if(!$r) err('Introuvable',404);
        if(!can(me(),$r['server_id'],PR)) err('Permission refusée',403);
        jDel('roles',$rid); jDelW('member_roles',['role_id'=>$rid]); ok();
    }
    if($a==='role.assign'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $rid=safeInt($_POST['rid']??0); $uid=safeInt($_POST['uid']??0);
        $role=jOne('roles',['id'=>$rid]); if(!$role) err('Rôle introuvable');
        // Verify role belongs to the right server
        $targetMem=jOne('server_members',['server_id'=>$role['server_id'],'user_id'=>$uid]);
        if(!$targetMem) err('Ce membre ne fait pas partie de ce serveur');
        if(!can(me(),$role['server_id'],64)) err('Permission refusée — Gérer les rôles requis',403);
        // Prevent role hierarchy bypass — can't assign role higher than own highest
        $myMaxPos=perm(me(),$role['server_id'])===PALL?9999:0;
        if($myMaxPos===0){$myRoles=jAll('member_roles',['server_id'=>$role['server_id'],'user_id'=>me()]);foreach($myRoles as $mr){$r=jOne('roles',['id'=>(int)$mr['role_id']]);if($r)$myMaxPos=max($myMaxPos,$r['position']??0);}}
        if(($role['position']??0)>=$myMaxPos&&!isOwner(me(),$role['server_id'])) err('Tu ne peux pas attribuer un rôle supérieur ou égal au tien',403); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0); $rid=(int)($_POST['rid']??0);
        if(!can(me(),$sid,PR)) err('Permission refusée',403);
        if(!jOne('roles',['id'=>$rid,'server_id'=>$sid])) err('Rôle invalide');
        if(!jOne('member_roles',['user_id'=>$tid,'role_id'=>$rid])) jIns('member_roles',['server_id'=>$sid,'user_id'=>$tid,'role_id'=>$rid]); ok();
    }
    if($a==='role.revoke'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0); $rid=(int)($_POST['rid']??0);
        if(!can(me(),$sid,PR)) err('Permission refusée',403);
        jDelW('member_roles',['server_id'=>$sid,'user_id'=>$tid,'role_id'=>$rid]); ok();
    }

    // ── MODERATION ───────────────────────────────────────────
    if($a==='mod.kick'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid2=(int)($_POST['sid']??0);$uid2=(int)($_POST['uid']??0);
        if($uid2==me()) err('Tu ne peux pas te kick toi-même');
        if(isOwner($uid2,$sid2)) err("Action impossible sur le propri\u00e9taire"); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0);
        if(!can(me(),$sid,PK)) err('Permission refusée',403); if(isOwner($tid,$sid)) err('Impossible d\'expulser le propriétaire');
        jDelW('server_members',['server_id'=>$sid,'user_id'=>$tid]); notif($tid,'kicked','Tu as été expulsé du serveur'); ok();
    }
    if($a==='mod.ban'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0); $reason=substr(trim($_POST['reason']??''),0,200);
        if(!can(me(),$sid,PB)) err('Permission refusée',403); if(isOwner($tid,$sid)) err('Impossible de bannir le propriétaire');
        jDelW('server_members',['server_id'=>$sid,'user_id'=>$tid]); jDelW('bans',['server_id'=>$sid,'user_id'=>$tid]);
        jIns('bans',['server_id'=>$sid,'user_id'=>$tid,'reason'=>$reason,'banned_by'=>me()]); notif($tid,'banned','Tu as été banni. Raison : '.($reason?:'Non spécifiée')); ok();
    }
    if($a==='mod.unban'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0);
        if(!can(me(),$sid,PB)) err('Permission refusée',403); jDelW('bans',['server_id'=>$sid,'user_id'=>$tid]); ok();
    }
    if($a==='mod.mute'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0);
        if(!can(me(),$sid,PMU)) err('Permission refusée',403);
        $all=jR('server_members'); foreach($all as $k=>$sm){ if($sm['server_id']==$sid&&$sm['user_id']==$tid){ $all[$k]['is_muted']=1; break; } } jW('server_members',$all); ok();
    }
    if($a==='mod.unmute'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0);
        if(!can(me(),$sid,PMU)) err('Permission refusée',403);
        $all=jR('server_members'); foreach($all as $k=>$sm){ if($sm['server_id']==$sid&&$sm['user_id']==$tid){ $all[$k]['is_muted']=0; break; } } jW('server_members',$all); ok();
    }
    if($a==='mod.nick'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_POST['sid']??0); $tid=(int)($_POST['uid']??0);
        $nick=substr(trim($_POST['nickname']??''),0,32)?:null;
        if($tid!=me()&&!can(me(),$sid,PR)) err('Permission refusée',403);
        $all=jR('server_members'); foreach($all as $k=>$sm){ if($sm['server_id']==$sid&&$sm['user_id']==$tid){ $all[$k]['nickname']=$nick; break; } } jW('server_members',$all); ok();
    }
    if($a==='mod.bans'){
        if(!isAuth()) err('Auth',401); $sid=(int)($_GET['sid']??0);
        if(!can(me(),$sid,PB)) err('Permission refusée',403);
        $bans=jAll('bans',['server_id'=>$sid]); foreach($bans as &$b){ $u=jOne('users',['id'=>(int)$b['user_id']]); $b['username']=$u?$u['username']:'#'.$b['user_id']; } ok($bans);
    }

    // ── USER PROFILE ─────────────────────────────────────────
    if($a==='user.profile'){
        if(!isAuth()) err('Auth',401); $tid=(int)($_GET['uid']??me()); $u=jOne('users',['id'=>$tid]); if(!$u) err('Introuvable',404);
        $me=me();
        $myM=jAll('server_members',['user_id'=>$me]); $hisM=jAll('server_members',['user_id'=>$tid]);
        $mySids=array_column($myM,'server_id'); $hisSids=array_column($hisM,'server_id'); $common=array_intersect($mySids,$hisSids);
        $mutual=[];
        foreach($common as $sid2){ $s=jOne('servers',['id'=>(int)$sid2]); if($s) $mutual[]=['id'=>$s['id'],'name'=>$s['name'],'icon_url'=>srvIcon($s['icon']??null,$s['name'])]; }
        $allF=jR('friends'); $isFriend=false;
        foreach($allF as $f){ if(($f['requester_id']==$me&&$f['addressee_id']==$tid||$f['requester_id']==$tid&&$f['addressee_id']==$me)&&$f['status']==='accepted'){ $isFriend=true; break; } }
        $badges=[]; if($u['is_admin']??0) $badges[]=['id'=>'admin','label'=>'Admin CentCord','emoji'=>'⚡'];
        ok(['id'=>$u['id'],'username'=>$u['username'],'discriminator'=>$u['discriminator'],'avatar_url'=>avUrl($u['avatar'],$u['username']),'banner_url'=>banUrl($u['banner']??null),'bio'=>$u['bio']??'','pronouns'=>$u['pronouns']??'','accent_color'=>$u['accent_color']??'#4F6BF4','status'=>$u['status']??'offline','custom_status'=>$u['custom_status']??'','created_at'=>$u['created_at']??'','mutual_servers'=>$mutual,'is_friend'=>$isFriend,'badges'=>$badges]);
    }
    if($a==='user.update'&&$m==='POST'){
        if(!isAuth()) err('Auth',401); $me=me(); $sets=[];
        if(isset($_POST['bio']))          $sets['bio']=substr(trim($_POST['bio']),0,300);
        if(isset($_POST['pronouns']))     $sets['pronouns']=substr(trim($_POST['pronouns']),0,40);
        if(isset($_POST['accent_color'])&&preg_match('/^#[0-9a-fA-F]{6}$/',$_POST['accent_color'])) $sets['accent_color']=$_POST['accent_color'];
        if(isset($_POST['status'])&&in_array($_POST['status'],['online','idle','dnd','invisible'])) $sets['status']=$_POST['status'];
        if(isset($_POST['custom_status'])) $sets['custom_status']=substr(trim($_POST['custom_status']),0,128);
        if(isset($_POST['theme'])&&in_array($_POST['theme'],['dark','darker','midnight','ocean'])) $sets['theme']=$_POST['theme'];
        if(!empty($_FILES['avatar'])&&$_FILES['avatar']['error']===0){ $fn=upload($_FILES['avatar'],'av'); if($fn) $sets['avatar']=$fn; }
        if(!empty($_FILES['banner'])&&$_FILES['banner']['error']===0){ $fn=upload($_FILES['banner'],'bn'); if($fn) $sets['banner']=$fn; }
        if(!empty($_POST['new_password'])){
            if(strlen($_POST['new_password'])<6) err('Nouveau mot de passe trop court');
            $cu=jOne('users',['id'=>$me]);
            if(!password_verify($_POST['current_password']??'',$cu['password'])) err('Mot de passe actuel incorrect');
            if(($_POST['new_password']??'')!==($_POST['new_password2']??'')) err('Confirmation incorrecte');
            $sets['password']=password_hash($_POST['new_password'],PASSWORD_BCRYPT,['cost'=>11]);
        }
        if(!empty($_POST['new_username'])){
            $nu=trim($_POST['new_username']);
            if(!preg_match('/^[a-zA-Z0-9_\-\.]{2,32}$/',$nu)) err('Pseudo invalide');
            if(jOne('users',['username'=>$nu])) err('Pseudo déjà utilisé');
            $cu=jOne('users',['id'=>$me]);
            if(!password_verify($_POST['pw_confirm']??'',$cu['password'])) err('Mot de passe requis pour changer le pseudo');
            $sets['username']=$nu;
        }
        if($sets) jUpd('users',$me,$sets);
        $u=jOne('users',['id'=>$me]); ok(['avatar_url'=>avUrl($u['avatar'],$u['username']),'username'=>$u['username']]);
    }
    if($a==='users.search'){
        if(!isAuth()) err('Auth',401); $q=trim($_GET['q']??''); if(strlen($q)<2) err('Trop court');
        $all=jR('users'); $res=[]; $me=me();
        foreach($all as $u){ if($u['id']!=$me&&stripos($u['username'],$q)!==false){ $res[]=['id'=>$u['id'],'username'=>$u['username'],'discriminator'=>$u['discriminator'],'avatar_url'=>avUrl($u['avatar'],$u['username']),'status'=>$u['status']??'offline','accent_color'=>$u['accent_color']??'#4F6BF4']; if(count($res)>=15) break; } }
        ok($res);
    }

    // ── NOTIFICATIONS & SEARCH ────────────────────────────────
    if($a==='notifs'){
        if(!isAuth()) err('Auth',401);
        $all=jAll('notifs',['user_id'=>me()]); usort($all,fn($a,$b)=>$b['id']-$a['id']);
        ok(['list'=>array_slice($all,0,30),'unread'=>count(array_filter($all,fn($n)=>!$n['read']))]);
    }
    if($a==='notifs.read'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $all=jR('notifs'); foreach($all as $k=>$n){ if($n['user_id']==me()&&!$n['read']) $all[$k]['read']=1; } jW('notifs',$all); ok();
    }
    if($a==='search'){
        if(!isAuth()) err('Auth',401); $q=trim($_GET['q']??''); $sid=(int)($_GET['sid']??0);
        if(strlen($q)<2) err('Trop court'); if(!isMem(me(),$sid)) err('Accès refusé',403);
        $cids=array_column(jAll('channels',['server_id'=>$sid]),'id');
        $all=jR('messages'); $res=[];
        foreach($all as $mm){
            if(!$mm['deleted']&&in_array($mm['channel_id'],$cids)&&stripos($mm['content'],$q)!==false){
                $u=jOne('users',['id'=>(int)$mm['author_id']]); $ch=jOne('channels',['id'=>(int)$mm['channel_id']]); if(!$u||!$ch) continue;
                $mm['username']=$u['username']; $mm['avatar_url']=avUrl($u['avatar'],$u['username']); $mm['html']=parseMsg($mm['content']); $mm['ch_name']=$ch['name']; $mm['ch_emoji']=$ch['emoji']??null; $res[]=$mm;
            }
        }
        usort($res,fn($a,$b)=>$b['id']-$a['id']); ok(array_slice($res,0,25));
    }

    // ── Channel read tracking ─────────────────────────────────────────────
    if($a==='ch.read'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_POST['cid']??0); $mid=(int)($_POST['mid']??0);
        $ex=jOne('read_states',['user_id'=>me(),'channel_id'=>$cid]);
        if($ex) jUpd('read_states',$ex['id'],['last_read_id'=>$mid]);
        else jIns('read_states',['user_id'=>me(),'channel_id'=>$cid,'last_read_id'=>$mid]);
        ok();
    }
    if($a==='ch.unread'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0); if(!$sid||!isMem(me(),$sid)) ok([]);
        $cids=array_column(jAll('channels',['server_id'=>$sid]),'id'); $res=[];
        foreach($cids as $cid){
            $rs=jOne('read_states',['user_id'=>me(),'channel_id'=>$cid]);
            $last_id=$rs['last_read_id']??0;
            $unread=count(array_filter(jR('messages'),fn($mm)=>!$mm['deleted']&&$mm['channel_id']==$cid&&$mm['id']>$last_id&&$mm['author_id']!=me()));
            if($unread>0) $res[(string)$cid]=$unread;
        }
        ok($res);
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    if($a==='audit.list'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0); if(!isMem(me(),$sid)) err('Accès refusé',403);
        $logs=jAll('audit_log',['server_id'=>$sid]);
        usort($logs,fn($a,$b)=>$b['id']-$a['id']); ok(array_slice($logs,0,50));
    }

    // ── Server stats ──────────────────────────────────────────────────────
    if($a==='srv.stats'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0); if(!isMem(me(),$sid)) err('Accès refusé',403);
        $cids=array_column(jAll('channels',['server_id'=>$sid]),'id');
        $all_msgs=array_filter(jR('messages'),fn($m)=>!$m['deleted']&&in_array($m['channel_id'],$cids));
        $mems=jAll('server_members',['server_id'=>$sid]);
        $roles=jAll('roles',['server_id'=>$sid]);
        $days=[];
        for($i=6;$i>=0;$i--){$d=date('Y-m-d',strtotime("-$i days"));$days[$d]=0;}
        foreach($all_msgs as $msg){$d=substr($msg['created_at']??'',0,10);if(isset($days[$d]))$days[$d]++;}
        $top_users=[];
        foreach($all_msgs as $msg){$uid=$msg['author_id'];$top_users[$uid]=($top_users[$uid]??0)+1;}
        arsort($top_users); $top_users=array_slice($top_users,0,5,true);
        $top_list=[];
        foreach($top_users as $uid=>$cnt){$u=jOne('users',['id'=>(int)$uid]);if($u)$top_list[]=['username'=>$u['username'],'avatar_url'=>avUrl($u['avatar'],$u['username']),'count'=>$cnt];}
        ok(['msg_count'=>count($all_msgs),'member_count'=>count($mems),'chan_count'=>count($cids),'role_count'=>count($roles),'msgs_per_day'=>$days,'top_users'=>$top_list]);
    }

    // ── Pagination ────────────────────────────────────────────────────────
    if($a==='msg.older'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_GET['cid']??0); $before=(int)($_GET['before']??0);
        if(!$cid||!isMem(me(),jOne('channels',['id'=>$cid])['server_id']??0)) err('Accès refusé',403);
        $all=jR('messages');
        $res=array_filter($all,fn($m)=>!$m['deleted']&&$m['channel_id']==$cid&&($before===0||$m['id']<$before));
        usort($res,fn($a,$b)=>$b['id']-$a['id']); $slice=array_slice(array_values($res),0,30);
        usort($slice,fn($a,$b)=>$a['id']-$b['id']);
        ok(array_map(fn($m)=>enrichMsg($m,me()),$slice));
    }

    // ── User activity ─────────────────────────────────────────────────────
    if($a==='user.activity'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $activity=trim($_POST['activity']??''); $emoji=trim($_POST['emoji']??'');
        if(mb_strlen($activity)>100) err('Trop long');
        jUpd('users',me(),['activity'=>$activity,'activity_emoji'=>$emoji]);
        ok();
    }

    // ── Invites ───────────────────────────────────────────────────────────
    if($a==='invite.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); if(!isMem(me(),$sid)) err('Accès refusé',403);
        $uses=(int)($_POST['max_uses']??0); $exp=(int)($_POST['expires_hours']??0);
        $code=genCode();
        $expires_at=$exp>0?date('Y-m-d H:i:s',strtotime("+$exp hours")):null;
        jIns('invites',['server_id'=>$sid,'code'=>$code,'created_by'=>me(),'max_uses'=>$uses,'uses'=>0,'expires_at'=>$expires_at]);
        ok(['code'=>$code,'expires_at'=>$expires_at]);
    }
    if($a==='invite.use'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $code=strtoupper(trim($_POST['code']??''));
        $inv=jOne('invites',['code'=>$code]);
        if($inv){
            if($inv['expires_at']&&strtotime($inv['expires_at'])<time()) err("Lien expiré");
            if($inv['max_uses']>0&&$inv['uses']>=$inv['max_uses']) err("Lien épuisé");
            $sid=$inv['server_id'];
            if(jOne('server_members',['server_id'=>$sid,'user_id'=>me()])) err('Déjà membre');
            jIns('server_members',['server_id'=>$sid,'user_id'=>me(),'joined_at'=>jNow(),'nickname'=>null,'is_muted'=>0]);
            jUpd('invites',$inv['id'],['uses'=>$inv['uses']+1]);
            $s=jOne('servers',['id'=>$sid]); ok(['id'=>$sid,'name'=>$s['name']]);
        }
        $s=jOne('servers',['invite_code'=>$code]);
        if(!$s) err('Code invalide');
        if(jOne('server_members',['server_id'=>$s['id'],'user_id'=>me()])) err('Déjà membre');
        jIns('server_members',['server_id'=>$s['id'],'user_id'=>me(),'joined_at'=>jNow(),'nickname'=>null,'is_muted'=>0]);
        ok(['id'=>$s['id'],'name'=>$s['name']]);
    }

    // ── Webhooks ──────────────────────────────────────────────────────────
    if($a==='webhook.list'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0); ok(jAll('webhooks',['server_id'=>$sid]));
    }
    if($a==='webhook.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); $cid=(int)($_POST['cid']??0); $name=trim($_POST['name']??'');
        if(!$name) err('Nom requis');
        $token=bin2hex(random_bytes(20));
        $id=jIns('webhooks',['server_id'=>$sid,'channel_id'=>$cid,'name'=>$name,'token'=>$token,'created_by'=>me(),'avatar'=>null]);
        ok(['id'=>$id,'token'=>$token,'name'=>$name]);
    }
    if($a==='webhook.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $wid=(int)($_POST['wid']??0); $wh=jOne('webhooks',['id'=>$wid]); if(!$wh) err('Introuvable');
        jDel('webhooks',$wid); ok();
    }
    if($a==='webhook.send'){
        $token=trim($_GET['token']??''); $wh=jOne('webhooks',['token'=>$token]); if(!$wh) err('Webhook introuvable',404);
        $content=trim($_POST['content']??$_GET['content']??''); if(!$content||mb_strlen($content)>2000) err('Contenu invalide');
        $mid=jIns('messages',['channel_id'=>$wh['channel_id'],'author_id'=>0,'content'=>$content,'type'=>'webhook','webhook_name'=>$wh['name'],'webhook_avatar'=>$wh['avatar'],'created_at'=>jNow(),'edited_at'=>null,'deleted'=>0,'pinned'=>0,'reply_to'=>null,'attachment'=>null]);
        ok(['id'=>$mid]);
    }

    // ── Poll ──────────────────────────────────────────────────────────────
    if($a==='poll.get'){
        if(!isAuth()) err('Auth',401);
        $pid=(int)($_GET['pid']??0); $poll=jOne('polls',['id'=>$pid]); if(!$poll) err('Sondage introuvable');
        $votes=jAll('poll_votes',['poll_id'=>$pid]);
        $options=json_decode($poll['options']??'[]',true);
        $counts=array_fill(0,count($options),0);
        foreach($votes as $v) $counts[$v['option']]++;
        $myVote=null; foreach($votes as $v){if($v['user_id']==me()){$myVote=$v['option'];break;}}
        ok(['question'=>$poll['question'],'options'=>$options,'counts'=>$counts,'total'=>count($votes),'my_vote'=>$myVote,'ended'=>(bool)$poll['ended']]);
    }
    if($a==='poll.vote'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $pid=(int)($_POST['pid']??0); $opt=(int)($_POST['option']??0);
        $poll=jOne('polls',['id'=>$pid]); if(!$poll) err('Sondage introuvable');
        if($poll['ended']) err('Ce sondage est terminé');
        $options=json_decode($poll['options']??'[]',true);
        if($opt<0||$opt>=count($options)) err('Option invalide');
        $ex=jOne('poll_votes',['poll_id'=>$pid,'user_id'=>me()]);
        if($ex) jDel('poll_votes',$ex['id']);
        jIns('poll_votes',['poll_id'=>$pid,'user_id'=>me(),'option'=>$opt]);
        $votes=jAll('poll_votes',['poll_id'=>$pid]);
        $counts=array_fill(0,count($options),0);
        foreach($votes as $v) $counts[$v['option']]++;
        ok(['counts'=>$counts,'total'=>count($votes),'my_vote'=>$opt]);
    }
    if($a==='poll.end'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $pid=(int)($_POST['pid']??0); $poll=jOne('polls',['id'=>$pid]); if(!$poll) err('Introuvable');
        jUpd('polls',$pid,['ended'=>1]); ok(['ended'=>true]);
    }


    // ══ CUSTOM EMOJI ════════════════════════════════════════════════════════
    if($a==='emoji.list'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0); if(!isMem(me(),$sid)) err('Accès refusé',403);
        ok(jAll('custom_emojis',['server_id'=>$sid]));
    }
    if($a==='emoji.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); $name=preg_replace('/[^a-z0-9_]/','',strtolower(trim($_POST['name']??'')));
        if(!perm(me(),$sid,32)) err('Permissions insuffisantes',403);
        if(!$name||strlen($name)<2) err('Nom invalide (min 2 car., a-z0-9_)');
        if(jOne('custom_emojis',['server_id'=>$sid,'name'=>$name])) err('Un emoji avec ce nom existe déjà');
        if(empty($_FILES['image'])||$_FILES['image']['error']!==0) err('Image requise');
        $fn=upload($_FILES['image'],'emoji'); if(!$fn) err('Image invalide');
        $id=jIns('custom_emojis',['server_id'=>$sid,'name'=>$name,'file'=>$fn,'creator_id'=>me(),'created_at'=>jNow()]);
        ok(['id'=>$id,'name'=>$name,'url'=>msgAttUrl($fn)]);
    }
    if($a==='emoji.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $eid=(int)($_POST['eid']??0); $e=jOne('custom_emojis',['id'=>$eid]); if(!$e) err('Introuvable');
        if(!perm(me(),$e['server_id'],32)) err('Permissions insuffisantes',403);
        jDel('custom_emojis',$eid); ok();
    }

    // ══ STICKERS ════════════════════════════════════════════════════════════
    if($a==='sticker.list'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0);
        $srv=jAll('stickers',['server_id'=>$sid]);
        $global=jAll('stickers',['server_id'=>0]);
        ok(array_merge($global,$srv));
    }
    if($a==='sticker.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); $name=trim($_POST['name']??''); $tags=trim($_POST['tags']??'');
        if(!perm(me(),$sid,32)) err('Permissions insuffisantes',403);
        if(!$name) err('Nom requis');
        if(empty($_FILES['image'])||$_FILES['image']['error']!==0) err('Image requise');
        $fn=upload($_FILES['image'],'sticker'); if(!$fn) err('Image invalide');
        $id=jIns('stickers',['server_id'=>$sid,'name'=>$name,'tags'=>$tags,'file'=>$fn,'creator_id'=>me(),'created_at'=>jNow()]);
        ok(['id'=>$id,'name'=>$name,'url'=>msgAttUrl($fn),'tags'=>$tags]);
    }
    if($a==='sticker.delete'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); $stid=(int)($_POST['stid']??0);
        if(!perm(me(),$sid,32)) err('Permissions insuffisantes',403);
        jDel('stickers',$stid); ok();
    }
    if($a==='sticker.send'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_POST['cid']??0); $stid=(int)($_POST['stid']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch) err('Salon introuvable');
        if(!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        $st=jOne('stickers',['id'=>$stid]); if(!$st) err('Sticker introuvable');
        $content=''; $att=$st['file'];
        $mid=jIns('messages',['channel_id'=>$cid,'author_id'=>me(),'content'=>$content,'type'=>'sticker','sticker_id'=>$stid,'attachment'=>$att,'created_at'=>jNow(),'edited_at'=>null,'deleted'=>0,'pinned'=>0,'reply_to'=>null]);
        $msg=jOne('messages',['id'=>$mid]);
        ok(enrichMsg($msg,me()));
    }

    // ══ BOOSTS ══════════════════════════════════════════════════════════════
    if($a==='boost.add'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); if(!isMem(me(),$sid)) err('Accès refusé',403);
        $ex=jOne('boosts',['server_id'=>$sid,'user_id'=>me()]);
        if($ex){ jDel('boosts',$ex['id']); $cnt=count(jAll('boosts',['server_id'=>$sid])); ok(['boosted'=>false,'count'=>$cnt]); }
        jIns('boosts',['server_id'=>$sid,'user_id'=>me(),'created_at'=>jNow()]);
        notif($sid,me(),'boost','a boosté le serveur ! 🚀');
        $cnt=count(jAll('boosts',['server_id'=>$sid]));
        ok(['boosted'=>true,'count'=>$cnt]);
    }
    if($a==='boost.count'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_GET['sid']??0);
        $cnt=count(jAll('boosts',['server_id'=>$sid]));
        $mine=!!jOne('boosts',['server_id'=>$sid,'user_id'=>me()]);
        ok(['count'=>$cnt,'boosted'=>$mine]);
    }

    // ══ BOOKMARKS ═══════════════════════════════════════════════════════════
    if($a==='bookmark.add'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $mid=(int)($_POST['mid']??0); $note=trim($_POST['note']??'');
        $msg=jOne('messages',['id'=>$mid]); if(!$msg) err('Message introuvable');
        $ex=jOne('bookmarks',['user_id'=>me(),'message_id'=>$mid]);
        if($ex){ jDel('bookmarks',$ex['id']); ok(['saved'=>false]); }
        jIns('bookmarks',['user_id'=>me(),'message_id'=>$mid,'note'=>$note,'created_at'=>jNow()]);
        ok(['saved'=>true]);
    }
    if($a==='bookmark.list'){
        if(!isAuth()) err('Auth',401);
        $bks=jAll('bookmarks',['user_id'=>me()]);
        usort($bks,fn($a,$b)=>$b['id']-$a['id']);
        $res=[];
        foreach($bks as $bk){
            $msg=jOne('messages',['id'=>(int)$bk['message_id']]); if(!$msg||$msg['deleted']) continue;
            $msg=enrichMsg($msg,me()); $msg['note']=$bk['note']; $msg['bk_id']=$bk['id'];
            $ch=jOne('channels',['id'=>(int)$msg['channel_id']]); if($ch){$msg['ch_name']=$ch['name'];$msg['ch_emoji']=$ch['emoji']??'';}
            $res[]=$msg;
        }
        ok($res);
    }

    // ══ VOICE CHANNELS (UI only) ═════════════════════════════════════════════
    if($a==='voice.join'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_POST['cid']??0);
        $ch=jOne('channels',['id'=>$cid]); if(!$ch||$ch['type']!=='voice') err('Ce salon n\'est pas vocal',400);
        if(!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        // Leave any current voice channel first
        $existing=array_filter(jR('voice_states'),fn($v)=>$v['user_id']==me());
        foreach($existing as $vs) jDel('voice_states',$vs['id']);
        jIns('voice_states',['channel_id'=>$cid,'user_id'=>me(),'muted'=>0,'deafened'=>0,'joined_at'=>jNow()]);
        ok(['joined'=>true]);
    }
    if($a==='voice.leave'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $existing=array_filter(jR('voice_states'),fn($v)=>$v['user_id']==me());
        foreach($existing as $vs) jDel('voice_states',$vs['id']);
        ok();
    }
    if($a==='voice.state'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $muted=(int)($_POST['muted']??0); $deafened=(int)($_POST['deafened']??0);
        $vs=array_filter(jR('voice_states'),fn($v)=>$v['user_id']==me());
        foreach($vs as $v) jUpd('voice_states',$v['id'],['muted'=>$muted,'deafened'=>$deafened]);
        ok();
    }
    if($a==='voice.list'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_GET['cid']??0);
        $states=jAll('voice_states',['channel_id'=>$cid]);
        $res=[];
        foreach($states as $vs){
            $u=jOne('users',['id'=>(int)$vs['user_id']]); if(!$u) continue;
            $res[]=['user_id'=>$vs['user_id'],'username'=>$u['username'],'avatar_url'=>avUrl($u['avatar'],$u['username']),'muted'=>$vs['muted'],'deafened'=>$vs['deafened']];
        }
        ok($res);
    }

    // ══ DISCOVERY ═══════════════════════════════════════════════════════════
    if($a==='discover'){
        if(!isAuth()) err('Auth',401);
        $q=trim($_GET['q']??''); $tag=trim($_GET['tag']??'');
        $all=jR('servers'); $res=[];
        foreach($all as $s){
            if(!($s['is_public']??1)) continue;
            if($q&&stripos($s['name'],$q)===false&&stripos($s['description']??'',$q)===false) continue;
            if($tag&&!in_array($tag,json_decode($s['tags']??'[]',true))) continue;
            $mc=count(jAll('server_members',['server_id'=>$s['id']]));
            $already=!!jOne('server_members',['server_id'=>$s['id'],'user_id'=>me()]);
            $s['member_count']=$mc; $s['already_member']=$already;
            $s['icon_url']=$s['icon']?msgAttUrl($s['icon']):null;
            $res[]=$s;
        }
        usort($res,fn($a,$b)=>$b['member_count']-$a['member_count']);
        ok(array_slice($res,0,20));
    }

    // ══ THREADS ═════════════════════════════════════════════════════════════
    if($a==='thread.create'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $mid=(int)($_POST['mid']??0); $name=trim($_POST['name']??'');
        if(!$name) err('Nom requis');
        $msg=jOne('messages',['id'=>$mid]); if(!$msg) err('Message introuvable');
        $ch=jOne('channels',['id'=>(int)$msg['channel_id']]); if(!$ch) err('Salon introuvable');
        if(!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        $tid=jIns('threads',['channel_id'=>$ch['id'],'parent_msg_id'=>$mid,'name'=>$name,'creator_id'=>me(),'created_at'=>jNow(),'archived'=>0]);
        jUpd('messages',$mid,['thread_id'=>$tid]);
        ok(['id'=>$tid,'name'=>$name]);
    }
    if($a==='thread.messages'){
        if(!isAuth()) err('Auth',401);
        $tid=(int)($_GET['tid']??0);
        $thr=jOne('threads',['id'=>$tid]); if(!$thr) err('Thread introuvable');
        $ch=jOne('channels',['id'=>(int)$thr['channel_id']]); if(!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        $msgs=array_filter(jR('messages'),fn($m)=>!$m['deleted']&&($m['thread_id']==$tid||$m['channel_id']==$thr['channel_id']&&$m['id']==$thr['parent_msg_id']));
        usort($msgs,fn($a,$b)=>$a['id']-$b['id']);
        ok(array_map(fn($m)=>enrichMsg($m,me()),$msgs));
    }
    if($a==='thread.send'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $tid=(int)($_POST['tid']??0); $content=trim($_POST['content']??'');
        $thr=jOne('threads',['id'=>$tid]); if(!$thr) err('Thread introuvable');
        if($thr['archived']) err('Thread archivé');
        $ch=jOne('channels',['id'=>(int)$thr['channel_id']]); if(!isMem(me(),$ch['server_id'])) err('Accès refusé',403);
        if(!$content) err('Message vide');
        $mid=jIns('messages',['channel_id'=>$thr['channel_id'],'thread_id'=>$tid,'author_id'=>me(),'content'=>$content,'type'=>'text','created_at'=>jNow(),'edited_at'=>null,'deleted'=>0,'pinned'=>0,'reply_to'=>null,'attachment'=>null]);
        $msg=jOne('messages',['id'=>$mid]);
        ok(enrichMsg($msg,me()));
    }

    // ══ SERVER TAGS (for discovery) ══════════════════════════════════════════
    if($a==='srv.tags'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $sid=(int)($_POST['sid']??0); if(!perm(me(),$sid,256)) err('Permissions insuffisantes',403);
        $tags=json_decode($_POST['tags']??'[]',true);
        if(!is_array($tags)) err('Format invalide');
        $tags=array_slice(array_unique($tags),0,5);
        jUpd('servers',$sid,['tags'=>json_encode($tags),'is_public'=>(int)($_POST['public']??1)]);
        ok(['tags'=>$tags]);
    }

    // ══ USER BADGES ═════════════════════════════════════════════════════════
    if($a==='badge.award'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        // Only admins can award badges manually, but some are auto-awarded
        $uid=(int)($_POST['uid']??0); $badge=trim($_POST['badge']??'');
        $BADGES=['nitro'=>'💎 CentCord Nitro','early'=>'🌅 Utilisateur Fondateur','boost'=>'🚀 Booster','dev'=>'🔧 Développeur','mod'=>'🛡️ Modérateur','partner'=>'🤝 Partenaire'];
        if(!isset($BADGES[$badge])) err('Badge inconnu');
        $ex=jOne('user_badges',['user_id'=>$uid,'badge'=>$badge]);
        if($ex) err('Badge déjà attribué');
        jIns('user_badges',['user_id'=>$uid,'badge'=>$badge,'awarded_at'=>jNow(),'awarded_by'=>me()]);
        ok(['badge'=>$badge,'label'=>$BADGES[$badge]]);
    }

    // ══ GIF SEARCH (via public API fallback) ════════════════════════════════
    if($a==='gif.trending'){
        if(!isAuth()) err('Auth',401);
        // Return curated list (no API key needed)
        $gifs=[
            ['id'=>1,'title'=>'Thumbs up','url'=>'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif','preview'=>'https://media.giphy.com/media/111ebonMs90YLu/200w.gif'],
            ['id'=>2,'title'=>'Wow','url'=>'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif','preview'=>'https://media.giphy.com/media/5VKbvrjxpVJCM/200w.gif'],
            ['id'=>3,'title'=>'Dance','url'=>'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif','preview'=>'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif'],
            ['id'=>4,'title'=>'Facepalm','url'=>'https://media.giphy.com/media/XsUtdIeJ0MWMo/giphy.gif','preview'=>'https://media.giphy.com/media/XsUtdIeJ0MWMo/200w.gif'],
            ['id'=>5,'title'=>'Clap','url'=>'https://media.giphy.com/media/GEBGhvBpS7OmhL4fdK/giphy.gif','preview'=>'https://media.giphy.com/media/GEBGhvBpS7OmhL4fdK/200w.gif'],
            ['id'=>6,'title'=>'Laugh','url'=>'https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif','preview'=>'https://media.giphy.com/media/ZqlvCTNHpqrio/200w.gif'],
            ['id'=>7,'title'=>'Mind blown','url'=>'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif','preview'=>'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/200w.gif'],
            ['id'=>8,'title'=>'Nope','url'=>'https://media.giphy.com/media/3og0INyCmHlNylks9O/giphy.gif','preview'=>'https://media.giphy.com/media/3og0INyCmHlNylks9O/200w.gif'],
            ['id'=>9,'title'=>'OK','url'=>'https://media.giphy.com/media/3oEjHAUOqG3lSS0f1C/giphy.gif','preview'=>'https://media.giphy.com/media/3oEjHAUOqG3lSS0f1C/200w.gif'],
            ['id'=>10,'title'=>'Hype','url'=>'https://media.giphy.com/media/YRuFixSNWFVcXaxpmX/giphy.gif','preview'=>'https://media.giphy.com/media/YRuFixSNWFVcXaxpmX/200w.gif'],
            ['id'=>11,'title'=>'Love it','url'=>'https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif','preview'=>'https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/200w.gif'],
            ['id'=>12,'title'=>'Shrug','url'=>'https://media.giphy.com/media/5C0a8IItAHRzqdU4bn/giphy.gif','preview'=>'https://media.giphy.com/media/5C0a8IItAHRzqdU4bn/200w.gif'],
        ];
        ok($gifs);
    }



    // ══ @ROLE & @MEMBER PING PERMISSIONS PER CHANNEL ════════════════════════
    if($a==='ch.mention_perms'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $cid=(int)($_POST['cid']??0); $ch=jOne('channels',['id'=>$cid]); if(!$ch) err('Introuvable');
        if(!perm(me(),$ch['server_id'],32)) err('Permission refusée',403);
        $allow_role_ping=(int)($_POST['allow_role_ping']??1);
        $allow_everyone=(int)($_POST['allow_everyone']??0);
        $allowed_roles=trim($_POST['allowed_roles']??''); // comma-sep role IDs
        jUpd('channels',$cid,['allow_role_ping'=>$allow_role_ping,'allow_everyone'=>$allow_everyone,'allowed_ping_roles'=>$allowed_roles]);
        ok();
    }

    // ══ DM VOICE CALL SIGNALING (WebRTC) ═════════════════════════════════════
    if($a==='call.offer'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $dmid=(int)($_POST['dmid']??0); $sdp=trim($_POST['sdp']??'');
        $dm=jOne('dms',['id'=>$dmid]); if(!$dm) err('DM introuvable');
        if($dm['user1_id']!=me()&&$dm['user2_id']!=me()) err('Accès refusé',403);
        $tid=($dm['user1_id']==me())?$dm['user2_id']:$dm['user1_id'];
        // Store call signal
        $ex=array_filter(jR('call_signals'),fn($s)=>$s['dm_id']==$dmid);
        foreach($ex as $s) jDel('call_signals',$s['id']);
        jIns('call_signals',['dm_id'=>$dmid,'caller_id'=>me(),'callee_id'=>$tid,'type'=>'offer','sdp'=>$sdp,'created_at'=>jNow()]);
        notif($tid,'call','Appel entrant 📞');
        ok();
    }
    if($a==='call.answer'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $dmid=(int)($_POST['dmid']??0); $sdp=trim($_POST['sdp']??'');
        $sig=jOne('call_signals',['dm_id'=>$dmid]); if(!$sig) err('Aucun appel en attente');
        jUpd('call_signals',$sig['id'],['type'=>'answer','answer_sdp'=>$sdp]);
        ok();
    }
    if($a==='call.ice'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $dmid=(int)($_POST['dmid']??0); $candidate=trim($_POST['candidate']??'');
        $ex=array_filter(jR('call_ice'),fn($s)=>$s['dm_id']==$dmid&&$s['from_id']!=me());
        foreach($ex as $s) jDel('call_ice',$s['id']);
        jIns('call_ice',['dm_id'=>$dmid,'from_id'=>me(),'candidate'=>$candidate,'created_at'=>jNow()]);
        ok();
    }
    if($a==='call.poll'){
        if(!isAuth()) err('Auth',401);
        $dmid=(int)($_POST['dmid']??0);
        $sig=jOne('call_signals',['dm_id'=>$dmid]); if(!$sig) ok(['status'=>'none']);
        if($sig['caller_id']==me()) ok(['status'=>$sig['type']==='answer'?'answered':'waiting','answer_sdp'=>$sig['answer_sdp']??null]);
        else ok(['status'=>$sig['type']==='offer'?'incoming':'none','sdp'=>$sig['sdp'],'from_id'=>$sig['caller_id']]);
    }
    if($a==='call.ice.poll'){
        if(!isAuth()) err('Auth',401);
        $dmid=(int)($_GET['dmid']??0);
        $mine=array_values(array_filter(jR('call_ice'),fn($s)=>$s['dm_id']==$dmid&&$s['from_id']!=me()));
        ok($mine);
    }
    if($a==='call.end'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $dmid=(int)($_POST['dmid']??0);
        $sigs=array_filter(jR('call_signals'),fn($s)=>$s['dm_id']==$dmid);
        foreach($sigs as $s) jDel('call_signals',$s['id']);
        $ices=array_filter(jR('call_ice'),fn($s)=>$s['dm_id']==$dmid);
        foreach($ices as $s) jDel('call_ice',$s['id']);
        ok();
    }

    // ══ PUBLIC KEY EXCHANGE (for E2E encryption) ══════════════════════════════
    if($a==='key.publish'&&$m==='POST'){
        if(!isAuth()) err('Auth',401);
        $pubkey=trim($_POST['pubkey']??''); // Base64-encoded ECDH public key
        if(!$pubkey) err('Clé publique requise');
        jUpd('users',me(),['ecdh_pubkey'=>$pubkey]);
        ok();
    }
    if($a==='key.get'){
        if(!isAuth()) err('Auth',401);
        $uid=(int)($_GET['uid']??0);
        $u=jOne('users',['id'=>$uid]); if(!$u) err('Utilisateur introuvable');
        ok(['pubkey'=>$u['ecdh_pubkey']??null,'uid'=>$uid]);
    }


    err('Action inconnue',404);
}
?><!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="csrf" content="<?=esc(csrf())?>">
<meta name="theme-color" content="#0d0e10">
<title>CentCord</title>
<link rel="icon" href="https://i.imgur.com/bUNH3Qs.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root,[data-theme=dark]{--bg0:#0d0e10;--bg1:#111216;--bg2:#17181d;--bg3:#1d1e24;--bg4:#23242c;--bg5:#2a2b35;--bgh:rgba(255,255,255,.04);--bga:rgba(255,255,255,.08);--fl:#141519;--flb:rgba(255,255,255,.06);--tx:rgba(255,255,255,.9);--txm:rgba(255,255,255,.45);--txs:rgba(255,255,255,.2);--ac:#4F6BF4;--ac2:#C77DFF;--acg:rgba(79,107,244,.3);--gr:#3BA55D;--rd:#ED4245;--yw:#FAA61A;--cy:#00B0F4;--bd:rgba(255,255,255,.07);--bd2:rgba(255,255,255,.12);--sh:0 8px 32px rgba(0,0,0,.6);--r:10px;--rs:6px;--rl:16px;--sw:72px;--cw:248px;--mw:240px;--hh:52px;--f:'Inter',sans-serif;--mo:'JetBrains Mono',monospace;--t:.15s cubic-bezier(.4,0,.2,1);--ts:.3s cubic-bezier(.34,1.56,.64,1)}
[data-theme=darker]{--bg0:#070809;--bg1:#0b0c0e;--bg2:#101113;--bg3:#141518;--bg4:#1a1b1f;--bg5:#202126}
[data-theme=midnight]{--bg0:#060714;--bg1:#080a1a;--bg2:#0d1020;--bg3:#111426;--bg4:#161930;--bg5:#1c2038;--ac:#6B7FF4}
[data-theme=ocean]{--bg0:#071018;--bg1:#0a1520;--bg2:#0f1c2a;--bg3:#142233;--bg4:#192a3e;--bg5:#1f334a;--ac:#43B8E6}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden;font-family:var(--f);background:var(--bg0);color:var(--tx);-webkit-font-smoothing:antialiased}
a{color:var(--ac);text-decoration:none}a:hover{text-decoration:underline}
button{cursor:pointer;font-family:var(--f);border:none;background:none;outline:none}
img,svg{display:block}input,textarea,select{font-family:var(--f)}
::selection{background:var(--ac);color:#fff}
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.22)}
#app{display:flex;height:100dvh;width:100vw;overflow:hidden}

/* ═══════════════════════════════════════
   AUTH — Split layout (héro + formulaire)
═══════════════════════════════════════ */
#auth-page{position:fixed;inset:0;z-index:9999;display:flex;overflow:auto}

/* Panneau gauche — Héro */
.auth-hero{flex:1.1;min-height:100dvh;background:#080a10;display:flex;flex-direction:column;justify-content:center;padding:56px 52px;position:relative;overflow:hidden}
.ah-bg{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 20% 40%,rgba(79,107,244,.22) 0%,transparent 65%),radial-gradient(ellipse 55% 45% at 85% 85%,rgba(199,125,255,.14) 0%,transparent 65%);pointer-events:none}
.ah-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 75% 75% at 50% 50%,black 30%,transparent 100%);pointer-events:none}
.ah-logo{display:flex;align-items:center;gap:14px;margin-bottom:52px;position:relative;z-index:1}
.ah-logo img{width:42px;height:42px;border-radius:12px}
.ah-logo-name{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#fff}
.ah-title{font-size:42px;font-weight:800;line-height:1.14;letter-spacing:-.8px;color:#fff;position:relative;z-index:1;margin-bottom:16px}
.ah-title span{background:linear-gradient(135deg,#7B8FF4,#D77DFF);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ah-sub{font-size:15px;color:rgba(255,255,255,.42);line-height:1.75;max-width:380px;position:relative;z-index:1;margin-bottom:44px}
.ah-feats{display:flex;flex-direction:column;gap:10px;position:relative;z-index:1}
.ah-feat{display:flex;align-items:center;gap:14px;padding:13px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.055);border-radius:12px}
.ah-feat-ic{width:34px;height:34px;border-radius:9px;background:rgba(79,107,244,.18);border:1px solid rgba(79,107,244,.28);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px}
.ah-feat-t{font-size:13px;font-weight:600;color:rgba(255,255,255,.82)}
.ah-feat-d{font-size:11px;color:rgba(255,255,255,.32);margin-top:1px}
.ah-footer{position:absolute;bottom:24px;left:52px;font-size:11px;color:rgba(255,255,255,.18);z-index:1}

/* Panneau droit — Formulaire */
.auth-form-side{width:440px;min-width:440px;background:var(--bg1);display:flex;flex-direction:column;justify-content:center;padding:48px 44px;overflow-y:auto;border-left:1px solid rgba(255,255,255,.045)}
.af-brand{display:flex;align-items:center;gap:10px;margin-bottom:32px}
.af-brand img{width:30px;height:30px;border-radius:8px}
.af-brand-n{font-size:14px;font-weight:700;color:var(--txm)}
.af-title{font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.2;margin-bottom:7px}
.af-sub{font-size:14px;color:var(--txm);line-height:1.6;margin-bottom:28px}
.auth-tabs{display:flex;background:var(--bg3);border-radius:var(--rs);padding:3px;margin-bottom:24px;gap:3px}
.atab{flex:1;padding:9px;border-radius:var(--rs);font-size:13px;font-weight:600;color:var(--txm);transition:all var(--t);text-align:center;cursor:pointer}.atab.act{background:var(--bg5);color:var(--tx)}
.auth-sw{text-align:center;font-size:13px;color:var(--txm);margin-top:18px}.auth-sw a{color:var(--ac);cursor:pointer;font-weight:600}

/* Captcha */
.captcha-wrap{margin-bottom:16px}
.captcha-box{display:flex;align-items:center;gap:10px;background:var(--bg0);border:1.5px solid var(--bd);border-radius:var(--rs);padding:10px 14px;margin-bottom:8px}
.captcha-q{font-family:var(--mo);font-size:22px;font-weight:700;letter-spacing:4px;color:var(--tx);flex:1;user-select:none}
.captcha-btn{width:30px;height:30px;border-radius:var(--rs);background:var(--bg4);border:1px solid var(--bd2);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--txm);font-size:16px;transition:all var(--t);flex-shrink:0}.captcha-btn:hover{background:var(--ac);color:#fff;border-color:var(--ac)}

/* Responsive: masquer héro sur mobile */
@media(max-width:860px){.auth-hero{display:none}.auth-form-side{width:100%;min-width:unset;padding:40px 24px;border-left:none}}

/* FORMS */
.fg{margin-bottom:16px}
.fl{display:block;font-size:11px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.fi{width:100%;padding:11px 14px;background:var(--bg3);border:1.5px solid var(--bd);border-radius:var(--rs);color:var(--tx);font-size:14px;outline:none;transition:border-color var(--t),box-shadow var(--t),background var(--t)}
.fi:hover{border-color:var(--bd2)}.fi:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--acg);background:var(--bg4)}.fi::placeholder{color:var(--txs)}
textarea.fi{resize:vertical;min-height:80px;line-height:1.5}select.fi{appearance:none;cursor:pointer}
.pw-w{position:relative}.pw-w .fi{padding-right:44px}.pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--txm);font-size:16px;cursor:pointer;padding:4px}.pw-eye:hover{color:var(--tx)}
.fi-color{width:44px;height:44px;border:2px solid var(--bd);border-radius:var(--rs);cursor:pointer;padding:2px;background:var(--bg3)}
.c-row{display:flex;align-items:center;gap:10px}.c-dots{display:flex;gap:5px;flex-wrap:wrap}
.cdot{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:transform var(--ts),border-color var(--t)}.cdot:hover{transform:scale(1.25)}.cdot.sel{border-color:#fff}
.err-box{color:var(--rd);font-size:13px;padding:10px 14px;background:rgba(237,66,69,.1);border-radius:var(--rs);border:1px solid rgba(237,66,69,.25);margin-bottom:14px;display:none;align-items:center;gap:8px}
/* BUTTONS */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 20px;border-radius:var(--rs);font-size:14px;font-weight:600;border:none;cursor:pointer;font-family:var(--f);transition:all var(--t);white-space:nowrap;user-select:none}
.btn:active:not(:disabled){transform:scale(.97)}.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-full{width:100%}.btn-sm{padding:7px 14px;font-size:13px}.btn-xs{padding:4px 9px;font-size:12px;border-radius:var(--rs)}.btn-icon{padding:8px}
.btn-p{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff}.btn-p:hover:not(:disabled){filter:brightness(1.1)}
.btn-d{background:var(--rd);color:#fff}.btn-d:hover:not(:disabled){background:#c62828}
.btn-s{background:var(--gr);color:#fff}.btn-s:hover:not(:disabled){background:#2e7d32}
.btn-g{background:transparent;color:var(--txm)}.btn-g:hover:not(:disabled){background:var(--bgh);color:var(--tx)}
.btn-o{background:transparent;color:var(--tx);border:1.5px solid var(--bd2)}.btn-o:hover:not(:disabled){background:var(--bgh)}
/* SERVER SIDEBAR */
#ssb{width:var(--sw);min-width:var(--sw);background:var(--bg0);display:flex;flex-direction:column;align-items:center;padding:8px 0;gap:2px;overflow-y:auto;overflow-x:hidden;z-index:20;border-right:1px solid var(--bd)}
.ssep{width:32px;height:1px;background:var(--bd);margin:4px 0;flex-shrink:0}
.sic{width:48px;height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;transition:border-radius var(--ts),filter var(--t);overflow:hidden;flex-shrink:0;margin:2px 0}
.sic img{width:100%;height:100%;object-fit:cover}.sic:hover,.sic.act{border-radius:var(--r);filter:brightness(1.1)}
.sic-pill{position:absolute;left:-6px;top:50%;transform:translateY(-50%);width:4px;border-radius:0 2px 2px 0;background:#fff;transition:height var(--ts);height:0}.sic:hover .sic-pill{height:20px}.sic.act .sic-pill{height:40px}
.sic-add{background:var(--bg3);color:var(--gr);font-size:22px;border:2px dashed var(--bd2)}.sic-add:hover{background:var(--gr);color:#fff;border-style:solid;border-color:var(--gr)}
.sic-h{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;font-size:20px}
.sic-tip{position:fixed;left:82px;background:var(--fl);color:var(--tx);padding:6px 12px;border-radius:var(--rs);font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .1s;z-index:300;box-shadow:var(--sh);border:1px solid var(--flb)}.sic:hover .sic-tip{opacity:1}
/* CHANNEL SIDEBAR */
#csb{width:var(--cw);min-width:var(--cw);background:var(--bg1);display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--bd);transition:transform .25s ease}
#srv-hdr{height:var(--hh);padding:0 14px;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;cursor:pointer;border-bottom:1px solid var(--bd);flex-shrink:0;gap:8px;transition:background var(--t);letter-spacing:-.2px}
#srv-hdr:hover{background:var(--bgh)}
.srv-n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srv-cv{color:var(--txm);transition:transform var(--t);flex-shrink:0}
#ch-list{flex:1;overflow-y:auto;padding:8px 6px}
.cat-hdr{display:flex;align-items:center;padding:14px 6px 4px;gap:4px;cursor:pointer;color:var(--txm);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;user-select:none;border-radius:var(--rs);transition:color var(--t),background var(--t)}.cat-hdr:hover{color:var(--tx);background:var(--bgh)}
.cat-cv{transition:transform var(--t);flex-shrink:0}.catcol .cat-cv{transform:rotate(-90deg)}.catcol .ch-items{display:none}
.cat-ab{margin-left:auto;opacity:0;padding:2px;border-radius:3px;display:flex;transition:opacity var(--t)}.cat-hdr:hover .cat-ab{opacity:1}.cat-ab:hover{color:#fff}
.ch-item{display:flex;align-items:center;gap:7px;padding:5px 8px 5px 10px;border-radius:var(--rs);margin:1px 0;cursor:pointer;color:var(--txm);font-size:14px;font-weight:500;position:relative;user-select:none;transition:color var(--t),background var(--t);min-height:34px}
.ch-item:hover{color:var(--tx);background:var(--bgh)}.ch-item.act{color:#fff;background:var(--bga)}
.ch-item.act::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:60%;background:var(--ac);border-radius:0 2px 2px 0}
.ch-ico{flex-shrink:0;color:var(--txs)}.ch-item.act .ch-ico,.ch-item:hover .ch-ico{color:var(--txm)}
.ch-n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ch-acts{display:flex;gap:2px;opacity:0;transition:opacity var(--t)}.ch-item:hover .ch-acts{opacity:1}
.ch-ab{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:4px;color:var(--txm);transition:all var(--t)}.ch-ab:hover{color:var(--tx);background:var(--bga)}
.ch-nsfw{font-size:9px;background:var(--rd);color:#fff;padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0}
.ch-slow{font-size:9px;background:var(--bg5);color:var(--txm);padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0}
.ch-lock{font-size:10px;color:var(--txs);flex-shrink:0}
#user-bar{height:58px;background:var(--bg0);display:flex;align-items:center;padding:0 8px;gap:8px;flex-shrink:0;border-top:1px solid var(--bd)}
.ub-av{position:relative;flex-shrink:0;cursor:pointer}.ub-av img{width:34px;height:34px;border-radius:50%}
.ub-st{position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;border:2.5px solid var(--bg0)}
.sto{background:#3BA55D}.sti{background:#FAA61A}.std{background:#ED4245}.stv,.stf{background:#747F8D}
.ub-inf{flex:1;min-width:0}.ub-nm{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ub-tg{font-size:11px;color:var(--txm)}.ub-cs{font-size:11px;color:var(--txm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ub-btns{display:flex;gap:2px}.ub-btn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--rs);color:var(--txm);font-size:16px;transition:all var(--t)}.ub-btn:hover{color:var(--tx);background:var(--bgh)}.ub-btn.act{color:var(--ac)}
/* MAIN */
#main{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--bg2)}
#ch-hdr{height:var(--hh);min-height:var(--hh);display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid var(--bd);background:var(--bg2);flex-shrink:0;z-index:5}
.chhic{font-size:18px;flex-shrink:0;color:var(--txm)}.chhnm{font-weight:700;font-size:16px;letter-spacing:-.2px;flex-shrink:0}.chhsep{width:1px;height:20px;background:var(--bd2);flex-shrink:0}.chhtp{flex:1;font-size:13px;color:var(--txm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hdr-acts{display:flex;align-items:center;gap:2px;margin-left:auto}
.hdr-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:var(--rs);color:var(--txm);font-size:18px;transition:all var(--t)}.hdr-btn:hover{color:var(--tx);background:var(--bgh)}.hdr-btn.act{color:var(--ac)}
/* MESSAGES */
#msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;scroll-behavior:smooth}
.ch-wlc{padding:20px 18px 16px;border-bottom:1px solid var(--bd);margin-bottom:8px}
.wlc-ic{width:72px;height:72px;border-radius:var(--r);display:flex;align-items:center;justify-content:center;font-size:40px;margin-bottom:14px;background:var(--bg3)}
.wlc-t{font-size:26px;font-weight:800;letter-spacing:-.5px;margin-bottom:6px}.wlc-d{font-size:14px;color:var(--txm);line-height:1.6}
.msg-dsep{display:flex;align-items:center;gap:12px;padding:10px 18px;font-size:11px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.06em}.msg-dsep::before,.msg-dsep::after{content:'';flex:1;height:1px;background:var(--bd)}
.mi{display:flex;align-items:flex-start;gap:14px;padding:2px 18px;position:relative;transition:background var(--t)}.mi:hover{background:var(--bgh)}.mf{padding-top:16px}
.mav{width:40px;height:40px;border-radius:50%;overflow:hidden;cursor:pointer;flex-shrink:0}.mav img{width:100%;height:100%;object-fit:cover}.mavsp{width:40px;flex-shrink:0}
.mb{flex:1;min-width:0}
.mhdr{display:flex;align-items:baseline;gap:8px;margin-bottom:3px;flex-wrap:wrap}
.mun{font-weight:600;font-size:15px;cursor:pointer;transition:color var(--t)}.mun:hover{text-decoration:underline}
.mts{font-size:11px;color:var(--txm)}.medit{font-size:11px;color:var(--txm);font-style:italic}.mpin{font-size:10px;background:var(--bg5);color:var(--txm);padding:1px 6px;border-radius:3px;font-weight:700}
.mtx{font-size:15px;line-height:1.5;word-break:break-word}
.mtx strong{font-weight:700}.mtx em{font-style:italic}.mtx u{text-decoration:underline}.mtx s{text-decoration:line-through;color:var(--txm)}
.mtx code{background:var(--bg0);padding:2px 6px;border-radius:4px;font-size:13px;font-family:var(--mo);color:#e06c75;border:1px solid var(--bd)}
.mtx pre{background:var(--bg0);border:1px solid var(--bd);border-radius:var(--rs);padding:14px;overflow-x:auto;margin:6px 0}.mtx pre code{background:none;border:none;padding:0;color:var(--tx);font-size:13px}
.mtx a{color:var(--ac);word-break:break-all}.mtx h2{font-size:20px;font-weight:700;margin:8px 0 4px}.mtx h3{font-size:17px;font-weight:700;margin:6px 0 3px}.mtx h4{font-size:15px;font-weight:700;margin:4px 0 2px}.mtx blockquote{border-left:3px solid var(--ac);padding-left:12px;color:var(--txm);margin:4px 0}
.mn{background:rgba(79,107,244,.2);color:#818CF8;padding:1px 5px;border-radius:4px;font-weight:600;cursor:pointer}.mn:hover{background:rgba(79,107,244,.35)}
.cmn{background:rgba(79,107,244,.15);color:#7DD3FC;padding:1px 5px;border-radius:4px;font-weight:600;cursor:pointer}
.mrply{display:flex;align-items:center;gap:8px;margin-bottom:3px;cursor:pointer;font-size:13px;color:var(--txm);transition:color var(--t)}.mrply:hover{color:var(--tx)}.mrply::before{content:'';flex-shrink:0;width:28px;height:10px;border-left:2px solid var(--txm);border-top:2px solid var(--txm);border-radius:4px 0 0 0;margin-left:12px;opacity:.5}
.mrxns{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.rxb{display:flex;align-items:center;gap:4px;padding:3px 9px;background:var(--bg3);border-radius:999px;font-size:14px;cursor:pointer;border:1.5px solid transparent;transition:all var(--t);color:var(--tx)}.rxb:hover{background:var(--bg5);border-color:var(--bd2)}.rxb.mine{background:rgba(79,107,244,.15);border-color:var(--ac);color:var(--ac)}.rxc{font-size:12px;font-weight:700}
.macts{position:absolute;top:-18px;right:18px;display:none;background:var(--fl);border:1px solid var(--flb);border-radius:var(--r);padding:3px 4px;gap:1px;box-shadow:var(--sh);z-index:10}.mi:hover .macts{display:flex}
.mab{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:var(--rs);color:var(--txm);font-size:16px;transition:all var(--t)}.mab:hover{color:var(--tx);background:var(--bgh)}.mab.dng:hover{color:var(--rd);background:rgba(237,66,69,.12)}
.sys-msg{display:flex;align-items:center;gap:10px;padding:4px 18px;font-size:13px;color:var(--txm);font-style:italic}
/* NOUVEAU: image dans les messages */
.msg-img{margin-top:8px}.msg-img img{max-width:420px;max-height:320px;border-radius:var(--rs);cursor:pointer;border:1px solid var(--bd);transition:opacity var(--t)}.msg-img img:hover{opacity:.9}
#typi{height:26px;padding:0 18px;font-size:13px;color:var(--txm);display:flex;align-items:center;gap:6px;flex-shrink:0}
.tdots{display:flex;gap:2px;align-items:center}.td{width:5px;height:5px;background:var(--txm);border-radius:50%;animation:tdot .7s infinite}.td:nth-child(2){animation-delay:.15s}.td:nth-child(3){animation-delay:.3s}
@keyframes tdot{0%,80%,100%{transform:scale(1)}40%{transform:scale(1.5)}}
/* INPUT */
#inp-area{padding:0 14px 16px;flex-shrink:0}
.rply-p{display:none;align-items:center;justify-content:space-between;background:var(--bg3);border-radius:var(--r) var(--r) 0 0;padding:8px 14px;font-size:13px;color:var(--txm);border:1px solid var(--bd);border-bottom:none}.rply-p.vis{display:flex}.rply-p strong{color:var(--tx)}
.rply-cls{cursor:pointer;color:var(--txm);font-size:18px;transition:color var(--t)}.rply-cls:hover{color:var(--rd)}
.file-p{display:none;background:var(--bg3);border-radius:var(--r) var(--r) 0 0;padding:10px 14px;gap:10px;align-items:center;border:1px solid var(--bd);border-bottom:none;font-size:13px}.file-p.vis{display:flex}.file-pn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.inp-box{background:var(--bg3);border:1px solid var(--bd);border-radius:var(--r);display:flex;align-items:flex-end;gap:8px;padding:0 12px;transition:border-color var(--t)}.inp-box:focus-within{border-color:var(--bd2)}
#msg-inp{flex:1;background:none;border:none;outline:none;color:var(--tx);font-size:15px;line-height:1.5;resize:none;max-height:280px;overflow-y:auto;padding:13px 0;font-family:var(--f)}#msg-inp::placeholder{color:var(--txs)}
.inp-tools{display:flex;align-items:center;gap:2px;padding:8px 0}
.inpb{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:var(--rs);color:var(--txm);font-size:18px;transition:all var(--t)}.inpb:hover{color:var(--ac);background:var(--bgh)}
.char-c{font-size:11px;color:var(--txm);padding:0 4px}.char-c.warn{color:var(--yw)}.char-c.lim{color:var(--rd)}
.inp-hint{font-size:11px;color:var(--txs);padding:4px 2px 0;line-height:1.6}
/* MEMBERS */
#mlist{width:var(--mw);min-width:var(--mw);background:var(--bg1);border-left:1px solid var(--bd);overflow-y:auto;padding:12px 8px;display:flex;flex-direction:column;gap:1px}
.ms-t{font-size:10px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.08em;padding:12px 8px 5px;margin-top:4px}
.memit{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:var(--rs);cursor:pointer;transition:background var(--t)}.memit:hover{background:var(--bgh)}
.memav{position:relative;flex-shrink:0}.memav img{width:34px;height:34px;border-radius:50%}
.memst{position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;border:2.5px solid var(--bg1)}
.meminf{flex:1;min-width:0}.memnm{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.memrl{font-size:11px;color:var(--txm)}.memmuted{font-size:10px;color:var(--rd);font-weight:700}
/* DM SIDEBAR */
#dm-sb{width:var(--cw);min-width:var(--cw);background:var(--bg1);border-right:1px solid var(--bd);display:flex;flex-direction:column;overflow:hidden}
.dm-srch{margin:10px 8px 6px;background:var(--bg3);border:1px solid var(--bd);border-radius:var(--rs);padding:7px 12px;color:var(--tx);font-size:13px;outline:none;cursor:pointer;width:calc(100% - 16px);transition:border-color var(--t)}.dm-srch:focus{border-color:var(--ac)}
.dm-st{padding:14px 14px 5px;font-size:10px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.08em}
.dmit{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:var(--rs);margin:1px 8px;cursor:pointer;transition:background var(--t)}.dmit:hover{background:var(--bgh)}.dmit.act{background:var(--bga)}
.dmav{position:relative;flex-shrink:0}.dmav img{width:34px;height:34px;border-radius:50%}.dmst{position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;border:2.5px solid var(--bg1)}
.dmnm{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dmsc{font-size:11px;color:var(--txm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* FRIENDS */
#fr-hdr{height:var(--hh);border-bottom:1px solid var(--bd);display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0;background:var(--bg2)}
.fr-nb{padding:4px 10px;border-radius:var(--rs);font-size:14px;font-weight:600;color:var(--txm);cursor:pointer;transition:all var(--t)}.fr-nb:hover,.fr-nb.act{background:var(--bga);color:var(--tx)}
.fr-ab{background:var(--gr);color:#fff;padding:5px 12px;border-radius:var(--rs);font-size:13px;font-weight:700;border:none;cursor:pointer;transition:background var(--t)}.fr-ab:hover{background:#2e7d32}
#fr-c{flex:1;overflow-y:auto;padding:20px}
.fr-s{font-size:11px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px;padding-bottom:8px;border-bottom:1px solid var(--bd)}
.frit{display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:var(--r);border:1px solid var(--bd);margin-bottom:5px;transition:all var(--t);cursor:pointer}.frit:hover{background:var(--bgh);border-color:var(--bd2)}
.friv{position:relative;flex-shrink:0}.friv img{width:42px;height:42px;border-radius:50%}.frist{position:absolute;bottom:-1px;right:-1px;width:13px;height:13px;border-radius:50%;border:2.5px solid var(--bg2)}
.frinfo{flex:1;min-width:0}.frnm{font-weight:700;font-size:15px;letter-spacing:-.1px}.frst{font-size:13px;color:var(--txm);margin-top:1px}
.fracts{display:flex;gap:8px;flex-shrink:0}
.frb{width:36px;height:36px;border-radius:50%;background:var(--bg3);border:1.5px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:16px;transition:all var(--t);cursor:pointer}.frb:hover{background:var(--bg5);border-color:var(--bd2);transform:scale(1.08)}
.frb.ok{background:rgba(59,165,93,.15);border-color:var(--gr);color:var(--gr)}.frb.ok:hover{background:var(--gr);color:#fff}
.frb.ng{background:rgba(237,66,69,.1);border-color:var(--rd);color:var(--rd)}.frb.ng:hover{background:var(--rd);color:#fff}
/* MODALS */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;animation:mfin .15s ease}
@keyframes mfin{from{opacity:0}to{opacity:1}}
.modal{background:var(--bg2);border-radius:var(--rl);border:1px solid var(--bd);padding:28px 32px;width:100%;max-width:500px;box-shadow:var(--sh);animation:min .2s var(--ts);max-height:90vh;overflow-y:auto;position:relative}
.modal-w{max-width:700px}.modal-xl{max-width:950px}
@keyframes min{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.mt{font-size:20px;font-weight:800;letter-spacing:-.3px;margin-bottom:5px}.ms{font-size:14px;color:var(--txm);margin-bottom:22px;line-height:1.5}
.mft{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;padding-top:18px;border-top:1px solid var(--bd)}
.mcls{position:absolute;top:16px;right:16px;width:28px;height:28px;border-radius:50%;background:var(--bg3);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--txm);cursor:pointer;transition:all var(--t)}.mcls:hover{background:var(--bg5);color:var(--tx)}
.m-tabs{display:flex;background:var(--bg3);border-radius:var(--rs);padding:3px;margin-bottom:20px;gap:2px}
.mtab{flex:1;padding:8px;border-radius:var(--rs);font-size:13px;font-weight:600;color:var(--txm);transition:all var(--t);text-align:center;cursor:pointer}.mtab.act{background:var(--bg5);color:var(--tx)}
.sett-wrap{display:flex;height:100%;min-height:400px;overflow:hidden}
.sett-nav{width:190px;flex-shrink:0;padding:16px 0;overflow-y:auto;border-right:1px solid var(--bd)}
.sett-nt{padding:8px 16px 4px;font-size:10px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.08em}
.sett-ni{padding:8px 16px;border-radius:var(--rs);margin:1px 8px;cursor:pointer;font-size:13px;color:var(--txm);transition:all var(--t);display:flex;align-items:center;gap:8px}.sett-ni:hover,.sett-ni.act{background:var(--bgh);color:var(--tx)}.sett-ni.act{background:var(--bga)}.sett-ni.dng{color:var(--rd)}
.sett-sep{height:1px;background:var(--bd);margin:8px 16px}
.sett-c{flex:1;padding:24px;overflow-y:auto}
.sett-s{font-size:20px;font-weight:800;letter-spacing:-.3px;margin-bottom:22px;padding-bottom:14px;border-bottom:1px solid var(--bd)}
/* CONTEXT / EMOJI / PROFILE / TOAST */
.ctx{position:fixed;background:var(--fl);border:1px solid var(--flb);border-radius:var(--r);padding:5px;min-width:185px;box-shadow:var(--sh);z-index:3000;animation:min .12s ease}
.cxi{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:var(--rs);font-size:13px;cursor:pointer;color:var(--tx);transition:all var(--t)}.cxi:hover{background:var(--ac);color:#fff}.cxi.dng:hover{background:var(--rd)}.cxsep{height:1px;background:var(--bd);margin:4px 0}
.epick{position:fixed;background:var(--fl);border:1px solid var(--flb);border-radius:var(--rl);padding:10px;display:flex;flex-wrap:wrap;gap:3px;width:288px;box-shadow:var(--sh);z-index:2000;animation:min .12s ease}
.ep-t{width:100%;font-size:10px;font-weight:700;color:var(--txm);text-transform:uppercase;letter-spacing:.06em;padding:0 4px 6px;border-bottom:1px solid var(--bd);margin-bottom:4px}
.emb{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:var(--rs);font-size:20px;cursor:pointer;transition:all var(--ts)}.emb:hover{background:var(--bgh);transform:scale(1.2)}
.ppop{position:fixed;background:var(--fl);border:1px solid var(--flb);border-radius:var(--rl);width:340px;box-shadow:var(--sh);z-index:2500;overflow:hidden;animation:min .15s ease}
.pban{height:90px;background:linear-gradient(135deg,var(--ac),var(--ac2));position:relative;overflow:hidden}
.pban-img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.pav{position:absolute;bottom:-22px;left:16px;width:76px;height:76px;border-radius:50%;border:5px solid var(--fl);overflow:hidden}.pav img{width:100%;height:100%;object-fit:cover}
.pbody{padding:30px 16px 16px}
.pnm{font-size:19px;font-weight:800;letter-spacing:-.3px}.pdisc{font-size:13px;color:var(--txm)}.ppr{font-size:12px;color:var(--txm);margin-top:2px}
.pst-pill{display:inline-flex;align-items:center;gap:6px;background:var(--bg3);padding:4px 10px;border-radius:999px;font-size:12px;margin-top:6px}
.pbio{margin-top:12px;padding-top:12px;border-top:1px solid var(--bd);font-size:13px;color:var(--txm);line-height:1.6}
.pbadges{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;background:var(--bg3);border:1px solid var(--bd)}
.pmutual{margin-top:10px;font-size:11px;color:var(--txm);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.pacts{display:flex;gap:8px;margin-top:12px}
#tc{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}
.toast{background:var(--fl);color:var(--tx);padding:12px 18px;border-radius:var(--r);font-size:14px;font-weight:600;box-shadow:var(--sh);border:1px solid var(--flb);border-left:4px solid var(--ac);animation:tin .3s var(--ts);max-width:340px;pointer-events:all;display:flex;align-items:center;gap:10px}
.toast.ok{border-left-color:var(--gr)}.toast.err{border-left-color:var(--rd)}.toast.warn{border-left-color:var(--yw)}
@keyframes tin{from{transform:translateX(120%);opacity:0}to{transform:none;opacity:1}}
/* MISC */
.hid{display:none!important}
.loader{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:14px;color:var(--txm)}
.spinner{width:36px;height:36px;border:3px solid var(--bd2);border-top-color:var(--ac);border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:14px;color:var(--txm);text-align:center;padding:48px}
.empty-ic{font-size:64px;filter:grayscale(1);opacity:.5}.empty-t{font-size:20px;font-weight:700;color:var(--tx)}.empty-d{font-size:14px;max-width:320px;line-height:1.6}
.divider{height:1px;background:var(--bd);margin:16px 0}
.info-box{background:rgba(79,107,244,.08);border:1px solid rgba(79,107,244,.25);border-radius:var(--rs);padding:12px;font-size:13px;color:var(--txm);line-height:1.6}
.warn-box{background:rgba(250,166,26,.08);border:1px solid rgba(250,166,26,.25);border-radius:var(--rs);padding:12px;font-size:13px;color:var(--txm);line-height:1.6}
.danger-box{background:rgba(237,66,69,.08);border:1px solid rgba(237,66,69,.25);border-radius:var(--rs);padding:12px;font-size:13px;color:var(--txm);line-height:1.6}
.inv-box{background:var(--bg0);border:1px solid var(--bd);border-radius:var(--r);padding:12px 16px;display:flex;align-items:center;gap:12px;margin-top:12px}
.inv-code{flex:1;font-family:var(--mo);font-size:18px;font-weight:700;letter-spacing:3px}
.pg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pi{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:var(--rs);cursor:pointer;transition:background var(--t)}.pi:hover{background:var(--bg4)}
.pi label{font-size:13px;cursor:pointer;flex:1}.pi input[type=checkbox]{width:16px;height:16px;accent-color:var(--ac);cursor:pointer}
.av-up{position:relative;width:80px;height:80px;margin:0 auto 12px;cursor:pointer}.av-up img{width:80px;height:80px;border-radius:50%;border:3px solid var(--bd2);transition:filter var(--t)}.av-up:hover img{filter:brightness(.7)}.av-up-ov{position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;opacity:0;transition:opacity var(--t);background:rgba(0,0,0,.5)}.av-up:hover .av-up-ov{opacity:1}
.role-row{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg3);border-radius:var(--rs);border:1px solid var(--bd);margin-bottom:6px}
/* MOBILE */
/* ════════════ RESPONSIVE — TABLET ════════════════════════════ */
@media(max-width:1200px){
  :root{
  --dvh:1vh; /* updated by JS for mobile browsers */--mw:0px}
  #mlist{display:none}
  #mlist.open{display:flex;position:fixed;right:0;top:0;height:100dvh;z-index:300;width:240px;box-shadow:-4px 0 24px rgba(0,0,0,.5)}
}
@media(max-width:1024px){
  .disc-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
  .modal-xl{max-width:98vw}
}

/* ════════════ RESPONSIVE — MOBILE ════════════════════════════ */
@media(max-width:768px){
  :root{
    --sw:0px;--cw:100vw;--mw:100vw;
    --hh:52px;
    font-size:15px;
  }

  /* ── Nav bar at bottom ── */
  #ssb{
    position:fixed;bottom:0;left:0;width:100%;height:60px;
    flex-direction:row;justify-content:flex-start;align-items:center;
    padding:0 4px;z-index:200;
    border-right:none;border-top:1px solid var(--bd);
    overflow-x:auto;overflow-y:hidden;gap:2px;
    background:var(--bg0);
    scrollbar-width:none;
    -webkit-overflow-scrolling:touch;
  }
  #ssb::-webkit-scrollbar{display:none}
  .ssep{width:1px;height:28px;background:var(--bd);margin:0 2px;flex-shrink:0}
  .sic-tip,.sic-pill{display:none}
  .sic{width:44px;height:44px;border-radius:12px;font-size:16px;flex-shrink:0}
  .sic.sic-h{width:44px;height:44px}
  .srv-badge{top:-2px;right:-2px;font-size:9px}

  /* ── Sidebars slide in ── */
  #csb,#dm-sb{
    position:fixed;left:0;top:0;
    height:calc(100dvh - 60px);
    width:min(280px,85vw);
    z-index:150;
    transform:translateX(-100%);
    transition:transform .25s cubic-bezier(.4,0,.2,1);
    box-shadow:none;
  }
  #csb.open,#dm-sb.open{
    transform:translateX(0);
    box-shadow:4px 0 24px rgba(0,0,0,.6);
  }

  /* ── Member list slides in from right ── */
  #mlist{
    position:fixed;right:0;top:0;
    height:calc(100dvh - 60px);
    width:min(260px,85vw);
    z-index:150;
    transform:translateX(110%);
    transition:transform .25s cubic-bezier(.4,0,.2,1);
  }
  #mlist.open{display:flex;transform:translateX(0);box-shadow:-4px 0 24px rgba(0,0,0,.6)}

  /* ── Overlay backdrop when sidebar open ── */
  .mob-overlay{display:none;position:fixed;inset:0 0 60px;background:rgba(0,0,0,.5);z-index:140;backdrop-filter:blur(2px)}
  .mob-overlay.vis{display:block}

  /* ── Main area ── */
  #main{padding-bottom:60px;min-height:0}
  #app{padding-bottom:0}
  #ch-hdr{padding:0 8px;gap:6px}
  .chhnm{font-size:15px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .chhtp{display:none}
  .chhsep{display:none}
  .hdr-acts{gap:2px}
  .hdr-btn{width:32px;height:32px;font-size:16px;padding:0}

  /* ── Messages ── */
  .mi{padding:2px 8px 2px 8px}
  .mi.mf{padding-top:8px}
  .mav{width:36px;height:36px;min-width:36px}
  .mavsp{width:36px;min-width:36px}
  .mun{font-size:14px}
  .mts{font-size:11px}
  .mtx{font-size:15px;line-height:1.5}
  .macts{opacity:1;position:relative;top:0;right:0;background:none;border:none;padding:2px 0 2px 44px;gap:4px;flex-wrap:wrap;display:none}
  .mi:active .macts,.mi:focus-within .macts{display:flex}
  .mab{width:32px;height:32px;font-size:15px}
  .msg-img img{max-width:min(280px,85vw);max-height:200px}
  .msg-dsep{font-size:10px;margin:10px 0}
  .ch-wlc{padding:16px 12px}
  .wlc-ic{font-size:36px}
  .wlc-t{font-size:20px}
  .wlc-d{font-size:13px}

  /* ── Input area ── */
  #inp-area{padding:6px 8px 8px}
  .inp-box{border-radius:12px;padding:6px 8px}
  #msg-inp{font-size:15px;max-height:120px}
  .inp-tools{gap:2px}
  .inpb{width:32px;height:32px;font-size:16px}
  .inp-hint{display:none}
  .rply-p,.file-p{padding:4px 8px;font-size:12px}

  /* ── Modals ── */
  .modal-bg .modal{
    position:fixed;bottom:0;left:0;right:0;
    max-height:92dvh;overflow-y:auto;
    border-radius:20px 20px 0 0;
    margin:0;padding:20px 16px;
    max-width:100%;
  }
  .modal-xl{height:92dvh;border-radius:20px 20px 0 0;display:flex;flex-direction:column}
  .sett-wrap{flex-direction:column;overflow:auto}
  .sett-nav{flex-direction:row;overflow-x:auto;border-bottom:1px solid var(--bd);border-right:none;padding:4px;min-width:unset;scrollbar-width:none}
  .sett-nav::-webkit-scrollbar{display:none}
  .sett-ni{white-space:nowrap;padding:6px 10px}
  .sett-nt,.sett-sep{display:none}
  .sett-c{padding:12px;overflow-y:auto}
  .mcls{position:absolute;top:12px;right:12px}
  .mt{font-size:18px}

  /* ── Friend list ── */
  .frit{padding:8px 10px}
  .friv img{width:36px;height:36px}
  .frnm{font-size:14px}
  .frb{width:34px;height:34px;font-size:16px}

  /* ── Home / DM sidebar ── */
  .fr-s{font-size:10px}
  #fr-c{padding:8px}
  #dm-list{padding:8px}
  .dmit{padding:8px 10px}

  /* ── Channel sidebar ── */
  .cat-hdr{font-size:10px;padding:6px 8px}
  .ch-item{font-size:13px;padding:3px 8px}
  .srv-nm-area{padding:10px 12px}
  #srv-nm{font-size:15px}

  /* ── Profile popup ── */
  .ppop{width:min(340px,96vw);border-radius:16px}
  .pban{height:80px}
  .pav img{width:64px;height:64px}

  /* ── Toast ── */
  .toast{bottom:70px;right:8px;left:8px;width:auto;max-width:unset;font-size:14px}

  /* ── Emoji / sticker pickers ── */
  .epick,.epick-discord{
    position:fixed!important;bottom:70px!important;left:0!important;right:0!important;
    width:100%!important;max-width:100%!important;
    border-radius:20px 20px 0 0;
    box-shadow:0 -8px 32px rgba(0,0,0,.5);
  }
  .ep-grid{grid-template-columns:repeat(8,1fr)}
  .emb{font-size:24px;padding:5px}

  /* ── Boost / E2E notice ── */
  .dm-e2e-notice{margin:4px 8px;font-size:11px}

  /* ── Thread panel ── */
  .thread-panel{width:100%!important;border-left:none;border-top:1px solid var(--bd)}
  .thread-panel.open{transform:translateY(0)!important}
  .thread-panel{transform:translateY(100%);top:auto;bottom:0;height:70dvh}

  /* ── Voice bar ── */
  .voice-bar.active{left:0;padding:6px 12px;height:48px}
  .voice-ch-name{font-size:12px}
  .voice-btn{padding:6px 10px;font-size:14px}

  /* ── Discovery grid ── */
  .disc-grid{grid-template-columns:1fr 1fr;gap:10px;padding:10px}
  .disc-card:hover{transform:none}
  .disc-body{padding:20px 10px 10px}
  .disc-name{font-size:13px}
  .disc-desc{font-size:11px;-webkit-line-clamp:1}

  /* ── Misc utils ── */
  .hmbtn{display:flex!important}
  .mob-h{display:none!important}
  .modal-w{max-width:100%;padding:16px}
}
@media(min-width:769px){.hmbtn{display:none!important}}
.hmbtn{display:none;width:36px;height:36px;align-items:center;justify-content:center;border-radius:var(--rs);background:none;border:none;cursor:pointer;color:var(--txm);transition:all var(--t)}.hmbtn:hover{color:var(--tx);background:var(--bgh)}

/* ════════════ RESPONSIVE — SMALL MOBILE (<400px) ═════════════ */
@media(max-width:400px){
  .sic{width:38px;height:38px;border-radius:10px;font-size:14px}
  #ssb{gap:1px;padding:0 2px}
  .hdr-acts button:nth-child(n+4){display:none}
  .frit{flex-wrap:wrap}
  .fracts{width:100%;justify-content:flex-end;margin-top:4px}
  .disc-grid{grid-template-columns:1fr}
  .stk-grid{grid-template-columns:repeat(4,1fr)}
}

/* ── Unread badges ─────────────────────────────────────── */
.ch-unread{background:var(--rd);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:9px;margin-left:auto;flex-shrink:0}
.ch-item.unread .ch-n{font-weight:700;color:var(--tx)!important}
.srv-badge{position:absolute;top:-4px;right:-4px;background:var(--rd);color:#fff;font-size:10px;font-weight:700;padding:1px 4px;border-radius:9px;min-width:16px;text-align:center}
.sic{position:relative}

/* ── Jump to bottom ────────────────────────────────────── */
#jtb{position:sticky;bottom:20px;float:right;margin-right:20px;background:var(--ac);color:#fff;border:none;border-radius:50%;width:40px;height:40px;cursor:pointer;font-size:18px;box-shadow:0 4px 16px rgba(0,0,0,.4);opacity:0;transform:translateY(20px);transition:opacity .2s,transform .2s;pointer-events:none;z-index:50}
#jtb.vis{opacity:1;transform:translateY(0);pointer-events:all}
#jtb:hover{transform:translateY(-2px)}

/* ── Drag overlay ──────────────────────────────────────── */
#drag-overlay{position:fixed;inset:0;background:rgba(79,107,244,.15);border:3px dashed var(--ac);z-index:9999;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:var(--ac);opacity:0;pointer-events:none;transition:opacity .15s;border-radius:12px;margin:12px}
#drag-overlay.vis{opacity:1;pointer-events:all}

/* ── Code blocks ────────────────────────────────────────── */
.cb-wrap{border-radius:var(--rs);overflow:hidden;margin:6px 0;border:1px solid var(--bd)}
.cb-hdr{display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,.3);padding:4px 12px;font-size:12px}
.cb-lang{color:var(--txm);font-family:var(--mo)}
.cb-copy{background:none;border:1px solid var(--bd);border-radius:4px;color:var(--txm);cursor:pointer;font-size:12px;padding:2px 8px;transition:all var(--t)}
.cb-copy:hover{background:var(--bg3);color:var(--tx)}
.cb-wrap pre{margin:0;padding:12px;overflow-x:auto}

/* ── Spoiler ────────────────────────────────────────────── */
.spoiler{background:var(--bg3);color:transparent;border-radius:3px;cursor:pointer;padding:0 2px;user-select:none;transition:all .2s}
.spoiler.revealed{color:inherit;background:rgba(79,107,244,.15)}
.spoiler:hover:not(.revealed){background:var(--bg2)}

/* ── Polls ──────────────────────────────────────────────── */
.poll-wrap{background:var(--bg3);border:1px solid var(--bd);border-radius:var(--r);padding:14px 16px;margin:6px 0;max-width:420px}
.poll-q{font-weight:700;margin-bottom:10px;font-size:15px}
.poll-opt-btn{display:flex;align-items:center;position:relative;width:100%;background:var(--bg2);border:1px solid var(--bd);border-radius:var(--rs);padding:8px 12px;cursor:pointer;margin-bottom:7px;overflow:hidden;text-align:left;color:var(--tx);font-size:14px;transition:border-color var(--t)}
.poll-opt-btn:hover:not(:disabled){border-color:var(--ac)}
.poll-opt-btn.voted{border-color:var(--ac);background:rgba(79,107,244,.08)}
.poll-opt-btn:disabled{cursor:default}
.poll-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,rgba(79,107,244,.2),rgba(79,107,244,.05));transition:width .4s ease;border-radius:var(--rs)}
.poll-ol{position:relative;flex:1;font-weight:500}
.poll-op{position:relative;font-size:12px;color:var(--txm);font-weight:700;margin-left:8px}
.poll-ft{font-size:12px;color:var(--txm);margin-top:8px;display:flex;align-items:center;gap:8px}

/* ── Lightbox ────────────────────────────────────────────── */
.lightbox{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center}
.lb-bg{position:absolute;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px)}
.lb-cnt{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:12px;max-width:90vw;max-height:90vh}
.lb-img{max-width:100%;max-height:80vh;border-radius:var(--r);box-shadow:0 20px 60px rgba(0,0,0,.5)}
.lb-acts{display:flex;gap:8px}

/* ── @mention autocomplete ──────────────────────────────── */
.at-pop{position:absolute;bottom:calc(100% + 4px);left:0;background:var(--bg1);border:1px solid var(--bd);border-radius:var(--r);padding:6px;min-width:240px;max-width:320px;box-shadow:0 -8px 32px rgba(0,0,0,.3);z-index:200}
.at-item{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:var(--rs);cursor:pointer;font-size:13px;transition:background var(--t)}
.at-item:hover,.at-item.sel{background:var(--ac);color:#fff}
.at-item.sel img,.at-item:hover img{filter:none}

/* ── Enhanced emoji picker ──────────────────────────────── */
.epick-full{width:320px;max-height:380px;display:flex;flex-direction:column}
.ep-search{padding:8px}
.ep-si{width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:var(--rs);padding:7px 10px;color:var(--tx);font-size:13px}
.ep-si:focus{outline:none;border-color:var(--ac)}
.ep-body{flex:1;overflow-y:auto;padding:4px 8px 8px}
.ep-grid{display:flex;flex-wrap:wrap;gap:2px;margin-bottom:4px}

/* ── Search results ─────────────────────────────────────── */
.search-item{padding:10px 12px;border-radius:var(--rs);border:1px solid var(--bd);margin-bottom:6px;transition:background var(--t)}
.search-item:hover{background:var(--bgh)}
.pin-card{background:var(--bg3);border-radius:var(--rs);padding:12px;border:1px solid var(--bd);margin-bottom:6px}

/* ── Message highlight (jump to) ──────────────────────────*/
.mi.highlight{animation:flash .5s ease 3}
@keyframes flash{0%,100%{background:transparent}50%{background:rgba(79,107,244,.18)}}

/* ── Webhook badge ───────────────────────────────────────── */
.wh-badge{background:var(--ac);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;vertical-align:middle;margin-left:4px;letter-spacing:.04em}

/* ── Compact mode ────────────────────────────────────────── */
[data-compact] .mi{padding:1px 0 1px 16px}
[data-compact] .mi.mf{margin-top:6px}
[data-compact] .mav,[data-compact] .mavsp{width:32px!important;height:32px!important;min-width:32px!important}
[data-compact] .mhdr{font-size:12px}
[data-compact] .mtx{font-size:13px}
[data-compact] .macts{top:0}

/* ── Status quick menu ────────────────────────────────────── */
.ub-av{cursor:pointer;position:relative}

/* ── Invite link copy box ─────────────────────────────────── */
.invite-box{background:var(--bg3);border:1px solid var(--bd);border-radius:var(--rs);padding:10px 14px;display:flex;align-items:center;gap:10px;margin-top:12px}

/* ── File preview ─────────────────────────────────────────── */
#file-pv{max-width:120px;max-height:80px;border-radius:var(--rs);object-fit:cover;margin-top:4px;display:none}

/* ── Better scrollbar ─────────────────────────────────────── */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.16)}


/* ── Discord-style emoji picker ────────────────────── */
.epick-discord{background:var(--bg1);border:1px solid var(--bd);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);overflow:hidden;display:flex;flex-direction:column}
.ep-searchrow{padding:10px 10px 6px}
.ep-si{width:100%;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:7px 12px;color:var(--tx);font-size:14px;box-sizing:border-box}
.ep-si:focus{outline:none;border-color:var(--ac)}
.ep-tabrow{display:flex;padding:2px 6px;border-bottom:1px solid var(--bd);gap:2px;overflow-x:auto;scrollbar-width:none}
.ep-tabrow::-webkit-scrollbar{display:none}
.ep-tab{background:none;border:none;cursor:pointer;padding:6px 7px;border-radius:6px;font-size:18px;transition:background var(--t);color:var(--txm);flex-shrink:0}
.ep-tab:hover{background:var(--bg3)}
.ep-tab.act{background:var(--ac20,rgba(79,107,244,.2));color:var(--tx)}
.ep-catname{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--txm);padding:8px 12px 4px}
.ep-grid{display:grid;grid-template-columns:repeat(9,1fr);gap:1px;padding:0 6px 8px;max-height:252px;overflow-y:auto}
.emb{background:none;border:none;cursor:pointer;font-size:22px;padding:4px;border-radius:6px;line-height:1;transition:background var(--t);display:flex;align-items:center;justify-content:center}
.emb:hover{background:var(--bg3)}

/* ══ NITRO BADGE ══════════════════════════════════════════════════ */
.nitro-badge{background:linear-gradient(90deg,#5865f2,#c77dff);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:9px;letter-spacing:.04em;vertical-align:middle;margin-left:4px}
.boost-btn{display:flex;align-items:center;gap:6px;background:none;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:4px 10px;cursor:pointer;color:var(--txm);font-size:12px;transition:all var(--t)}
.boost-btn:hover,.boost-btn.boosted{border-color:#ff73fa;color:#ff73fa}
.boost-btn.boosted{background:rgba(255,115,250,.08)}
.boost-bar{height:4px;background:var(--bg3);border-radius:2px;margin:8px 0;overflow:hidden}
.boost-fill{height:100%;background:linear-gradient(90deg,#5865f2,#ff73fa);border-radius:2px;transition:width .4s ease}
.boost-lvl{font-size:11px;color:var(--txm);text-align:right;margin-top:2px}

/* ══ STICKER PICKER ═══════════════════════════════════════════════ */
.stk-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px;max-height:280px;overflow-y:auto}
.stk-item{cursor:pointer;border-radius:8px;overflow:hidden;border:2px solid transparent;transition:all var(--t);aspect-ratio:1}
.stk-item:hover{border-color:var(--ac);transform:scale(1.05)}
.stk-item img{width:100%;height:100%;object-fit:cover}
.stk-msg img{width:128px;height:128px;border-radius:8px;object-fit:contain}

/* ══ VOICE CHANNEL ════════════════════════════════════════════════ */
.ch-voice{background:rgba(59,165,93,.06);border-left:2px solid #3ba55d}
.ch-voice:hover{background:rgba(59,165,93,.12)}
.ch-voice.active-voice{background:rgba(59,165,93,.15)}
.voice-users{display:flex;flex-direction:column;gap:2px;padding:2px 4px 4px 22px}
.voice-user{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;font-size:12px;color:var(--txm)}
.voice-user img{width:20px;height:20px;border-radius:50%;border:1px solid var(--bd)}
.voice-user.speaking{color:var(--tx)}
.voice-user .vi{font-size:10px}
.voice-bar{position:fixed;bottom:0;left:72px;right:0;background:var(--bg0);border-top:1px solid var(--bd);display:flex;align-items:center;gap:12px;padding:8px 16px;z-index:100;display:none}
.voice-bar.active{display:flex}
.voice-ch-name{font-size:13px;font-weight:700;color:#3ba55d;flex:1}
.voice-ctrl{display:flex;gap:8px}
.voice-btn{background:var(--bg3);border:none;border-radius:8px;padding:8px 12px;cursor:pointer;color:var(--tx);font-size:16px;transition:all var(--t)}
.voice-btn:hover{background:var(--bgh)}
.voice-btn.muted,.voice-btn.deafened{color:var(--rd);background:rgba(237,66,69,.1)}
.voice-btn.leave{color:var(--rd)}
.voice-btn.leave:hover{background:var(--rd);color:#fff}

/* ══ DISCOVERY ════════════════════════════════════════════════════ */
.disc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;padding:16px}
.disc-card{background:var(--bg3);border-radius:var(--r);overflow:hidden;cursor:pointer;border:1px solid var(--bd);transition:all var(--t)}
.disc-card:hover{border-color:var(--ac);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.disc-banner{height:80px;background:linear-gradient(135deg,var(--ac),var(--ac)88);position:relative}
.disc-icon{width:48px;height:48px;border-radius:16px;border:3px solid var(--bg1);position:absolute;bottom:-20px;left:14px;overflow:hidden;background:var(--bg2)}
.disc-icon img,.disc-icon div{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff}
.disc-body{padding:24px 14px 14px}
.disc-name{font-weight:700;font-size:15px;margin-bottom:4px}
.disc-desc{font-size:12px;color:var(--txm);line-height:1.4;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.disc-meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--txm)}
.disc-tag{background:var(--bg2);border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;color:var(--txm)}
.disc-online{width:8px;height:8px;border-radius:50%;background:#3ba55d;flex-shrink:0}

/* ══ BOOKMARKS ════════════════════════════════════════════════════ */
.bk-item{background:var(--bg3);border:1px solid var(--bd);border-radius:var(--rs);padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color var(--t)}
.bk-item:hover{border-color:var(--ac)}
.bk-note{font-size:11px;color:var(--ac);font-style:italic;margin-top:4px}
.bk-loc{font-size:11px;color:var(--txm);margin-bottom:4px}

/* ══ THREADS ══════════════════════════════════════════════════════ */
.thread-btn{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--ac);cursor:pointer;padding:2px 8px;border-radius:4px;border:1px solid rgba(79,107,244,.3);margin-top:4px;transition:all var(--t);background:none}
.thread-btn:hover{background:rgba(79,107,244,.1)}
.thread-panel{position:fixed;right:0;top:0;bottom:0;width:360px;background:var(--bg1);border-left:1px solid var(--bd);z-index:400;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s ease}
.thread-panel.open{transform:translateX(0)}
.thread-hdr{padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px}
.thread-msgs{flex:1;overflow-y:auto;padding:12px}
.thread-inp{padding:10px 12px;border-top:1px solid var(--bd);display:flex;gap:8px}
.thread-inp textarea{flex:1;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;color:var(--tx);font-size:14px;resize:none;min-height:38px;max-height:120px}

/* ══ GIF PICKER ══════════════════════════════════════════════════ */
.gif-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px;max-height:280px;overflow-y:auto}
.gif-item{cursor:pointer;border-radius:6px;overflow:hidden;transition:opacity var(--t);aspect-ratio:16/9}
.gif-item:hover{opacity:.8}
.gif-item img{width:100%;height:100%;object-fit:cover}

/* ══ CUSTOM EMOJI ════════════════════════════════════════════════ */
.cemoji{width:22px;height:22px;vertical-align:middle;border-radius:3px;object-fit:contain}
.cemoji.big{width:48px;height:48px}
.ep-server-emojis{padding:0 6px 8px}

/* ══ SRV HEADER BOOST ════════════════════════════════════════════ */
#srv-hdr{display:flex;align-items:center;cursor:pointer;padding:12px 16px;border-bottom:1px solid var(--bd);gap:8px}
.srv-boost-pill{display:flex;align-items:center;gap:4px;background:rgba(255,115,250,.1);border:1px solid rgba(255,115,250,.3);border-radius:8px;padding:2px 7px;font-size:10px;font-weight:700;color:#ff73fa;margin-left:auto}


.sic-disc{background:rgba(79,107,244,.15)!important;color:var(--ac)!important;font-size:13px!important;font-weight:700!important;border-radius:12px!important}

/* ══ CALL UI ═══════════════════════════════════════════════ */
@keyframes incoming{from{box-shadow:0 0 0 0 rgba(59,165,93,.5)}to{box-shadow:0 0 0 16px rgba(59,165,93,0)}}

/* ══ @MENTIONS ══════════════════════════════════════════════ */
.ping-all{background:rgba(250,166,26,.15);color:#faa61a;border-radius:3px;padding:0 2px;font-weight:700;cursor:default}
.ping-no{color:var(--txm);cursor:not-allowed}
.mn{background:rgba(79,107,244,.15);color:var(--ac);border-radius:3px;padding:0 2px;font-weight:600;cursor:pointer}
.mn:hover{background:rgba(79,107,244,.25)}

/* ══ E2E INDICATOR ══════════════════════════════════════════ */
.e2e-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;background:rgba(59,165,93,.12);border:1px solid rgba(59,165,93,.25);color:#3ba55d;border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.dm-e2e-notice{background:rgba(59,165,93,.08);border:1px solid rgba(59,165,93,.2);border-radius:8px;padding:8px 12px;font-size:12px;color:#3ba55d;text-align:center;margin:8px 16px}


/* ════════════ AUTH PAGE MOBILE ═══════════════════════════════ */
@media(max-width:480px){
  .auth-form-side{padding:24px 16px}
  .af-title{font-size:22px}
  .fi{font-size:16px} /* prevent iOS zoom on focus */
  .auth-tabs{gap:0}
  .atab{font-size:13px;padding:8px 12px}
  .captcha-wrap{flex-wrap:wrap}
}
/* ════════════ INPUT FIXES ════════════════════════════════════ */
input,textarea,select{font-size:16px!important} /* prevent iOS zoom */
@media(min-width:769px){
  input,textarea,select{font-size:inherit!important}
}
/* ════════════ TOUCH TARGETS ══════════════════════════════════ */
@media(max-width:768px){
  button,a,[onclick],[role=button]{min-height:36px;min-width:36px}
  .ch-item{min-height:36px}
  .atab{min-height:40px}
  .frb{min-width:44px;min-height:44px}
  .ub-btn{min-width:36px;min-height:36px}
  .sic{min-width:44px;min-height:44px}
  /* Safe area for notched phones */
  #ssb{padding-bottom:env(safe-area-inset-bottom,0)}
  #inp-area{padding-bottom:max(8px,env(safe-area-inset-bottom,8px))}
  .voice-bar.active{padding-bottom:max(8px,env(safe-area-inset-bottom,8px))}
}
</style>
</head>
<body>

<!-- AUTH PAGE: Split héro + formulaire -->
<div id="auth-page">
  <!-- Panneau gauche héro -->
  <div class="auth-hero">
    <div class="ah-bg"></div>
    <div class="ah-grid"></div>
    <div class="ah-logo">
      <img src="https://i.imgur.com/1P8HxTm.png" alt="CentCord">
      <span class="ah-logo-name">CentCord</span>
    </div>
    <div class="ah-title">Tes communautés,<br><span>réunies en un seul endroit.</span></div>
    <p class="ah-sub">Crée des serveurs, rejoins des communautés, échange avec tes amis — simple, rapide et sécurisé.</p>
    <div class="ah-feats">
      <div class="ah-feat">
        <div class="ah-feat-ic">💬</div>
        <div><div class="ah-feat-t">Salons en temps réel</div><div class="ah-feat-d">Texte, annonces et forums organisés</div></div>
      </div>
      <div class="ah-feat">
        <div class="ah-feat-ic">🛡️</div>
        <div><div class="ah-feat-t">Modération avancée</div><div class="ah-feat-d">Rôles, permissions, ban, mute et plus</div></div>
      </div>
      <div class="ah-feat">
        <div class="ah-feat-ic">🔒</div>
        <div><div class="ah-feat-t">Sécurisé & privé</div><div class="ah-feat-d">Tes données restent chez toi</div></div>
      </div>
    </div>
    <div class="ah-footer">© 2025 CentCord · Tous droits réservés</div>
  </div>

  <!-- Panneau droit formulaire -->
  <div class="auth-form-side">
    <div class="af-brand">
      <img src="https://i.imgur.com/bUNH3Qs.png" alt="CentCord">
      <span class="af-brand-n">CentCord</span>
    </div>
    <div class="af-title" id="af-title">Bon retour !</div>
    <div class="af-sub" id="af-sub">Connecte-toi pour rejoindre ta communauté.</div>

    <div class="auth-tabs">
      <div class="atab act" id="tab-li" onclick="setMode('login')">Se connecter</div>
      <div class="atab" id="tab-re" onclick="setMode('register')">Créer un compte</div>
    </div>

    <form id="auth-form">
      <div class="fg"><label class="fl">Pseudo</label><input id="f-un" class="fi" type="text" placeholder="TonPseudo" maxlength="32" autocomplete="username" required autocorrect="off" autocapitalize="none" spellcheck="false"></div>
      <div class="fg pw-w"><label class="fl">Mot de passe</label><input id="f-pw" class="fi" type="password" placeholder="Minimum 6 caractères" required><button type="button" class="pw-eye" onclick="togglePw('f-pw')">👁</button></div>
      <div class="fg pw-w hid" id="f-pw2-g"><label class="fl">Confirmer le mot de passe</label><input id="f-pw2" class="fi" type="password" placeholder="Répéter le mot de passe"><button type="button" class="pw-eye" onclick="togglePw('f-pw2')">👁</button></div>

      <!-- NOUVEAU: Captcha (visible uniquement à l'inscription) -->
      <div id="captcha-group" class="captcha-wrap hid">
        <label class="fl">Vérification anti-bot</label>
        <div class="captcha-box">
          <div style="flex:1">
            <div style="font-size:11px;color:var(--txm);margin-bottom:4px">Résous ce calcul :</div>
            <div class="captcha-q" id="captcha-q">— — —</div>
          </div>
          <button type="button" class="captcha-btn" onclick="W.refreshCaptcha()" title="Nouveau calcul">🔄</button>
        </div>
        <input id="f-captcha" class="fi" type="number" placeholder="Réponse..." style="font-family:var(--mo);font-size:18px;font-weight:700;text-align:center;letter-spacing:3px">
      </div>

      <div id="auth-err" class="err-box"><span>⚠️</span><span id="auth-err-txt"></span></div>
      <button type="submit" id="auth-btn" class="btn btn-p btn-full" style="height:46px;font-size:15px;margin-top:4px">Se connecter</button>
    </form>
    <div class="auth-sw">Nouveau sur CentCord ? <a id="auth-sw-a">Créer un compte</a></div>
  </div>
</div>

<div id="app" class="hid">
  <nav id="ssb"><div id="srv-list"></div></nav>
  <aside id="csb" class="hid"><div id="srv-hdr"><span id="srv-nm" class="srv-n">Serveur</span><svg class="srv-cv" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div><div id="ch-list"></div><div id="user-bar"></div></aside>
  <aside id="dm-sb" class="hid">
    <div style="height:var(--hh);border-bottom:1px solid var(--bd);display:flex;align-items:center;padding:0 14px;gap:10px;font-weight:800;font-size:16px;letter-spacing:-.2px;flex-shrink:0">
      <img src="https://i.imgur.com/bUNH3Qs.png" style="width:24px;height:24px;border-radius:6px"><span style="background:linear-gradient(135deg,var(--ac),var(--ac2));-webkit-background-clip:text;-webkit-text-fill-color:transparent">CentCord</span>
    </div>
    <input class="dm-srch" placeholder="Trouver une conversation..." id="dm-srch" readonly>
    <div class="dm-st">Messages directs</div>
    <div id="dm-list" style="flex:1;overflow-y:auto"></div>
    <div id="dm-ub" style="height:58px;background:var(--bg0);display:flex;align-items:center;padding:0 8px;gap:8px;flex-shrink:0;border-top:1px solid var(--bd)"></div>
  </aside>
  <div id="home-view" style="display:none;flex:1;min-width:0;flex-direction:column;overflow:hidden">
    <div id="fr-hdr">
      <button class="hmbtn" id="dm-mob-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="color:var(--txm);flex-shrink:0"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
      <span style="font-weight:800;font-size:16px;letter-spacing:-.2px">Amis</span>
      <div style="width:1px;height:22px;background:var(--bd)"></div>
      <button class="fr-nb act" id="fr-btn-all" onclick="W.frTab('all')">Tous</button>
      <button class="fr-nb" id="fr-btn-pending" onclick="W.frTab('pending')">En attente</button>
      <button class="fr-nb" id="fr-btn-blocked" onclick="W.frTab('blocked')">Bloqués</button>
      <div style="margin-left:auto"><button class="fr-ab" onclick="W.showAddFriend()">➕ Ajouter</button></div>
    </div>
    <div id="fr-c" style="flex:1;overflow-y:auto;padding:20px"></div>
  </div>
  <main id="main" class="hid" style="flex:1;display:flex;flex-direction:column;min-width:0">
    <div id="ch-hdr">
      <button class="hmbtn" id="ch-mob-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <span id="chhic" class="chhic">#</span>
      <span id="chhnm" class="chhnm">général</span>
      <div class="chhsep"></div>
      <span id="chhtp" class="chhtp"></span>
      <div class="hdr-acts">
        <button class="hdr-btn" id="hdr-call" title="Appel vocal" onclick="W._startCallFromHeader()" style="display:none;color:#3ba55d;font-size:18px">📞</button>
        <button class="hdr-btn" id="hdr-pins" title="Messages épinglés" onclick="W.showPins()">📌</button>
        <button class="hdr-btn" id="hdr-search" title="Rechercher" onclick="W.showSearch()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
        <button class="hdr-btn" id="hdr-mem" title="Membres" onclick="W.toggleMembers()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
      </div>
    </div>
    <div id="msgs" style="flex:1;overflow-y:auto;display:flex;flex-direction:column"></div>
    <div id="typi"></div>
    <div id="inp-area" class="hid">
      <div class="rply-p" id="rply-p"><span id="rply-txt">Répondre à <strong></strong></span><button class="rply-cls" onclick="W.clearReply()">✕</button></div>
      <div class="file-p" id="file-p"><img id="file-pv" style="display:none;max-height:48px;border-radius:4px;margin-right:6px"><span style="font-size:20px">📎</span><span class="file-pn" id="file-pn"></span><button class="rply-cls" onclick="W.clearFile()">✕</button></div>
      <div class="inp-box" id="inp-box">
        <!-- MODIFIÉ: accept uniquement les vraies images -->
        <label class="inpb" style="cursor:pointer" title="Envoyer une image"><input type="file" id="file-inp" style="display:none" accept="image/jpeg,image/png,image/gif,image/webp" onchange="W.onFile(this)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></label>
        <textarea id="msg-inp" placeholder="Écrire un message..." rows="1"></textarea>
        <div class="inp-tools">
          <span class="char-c" id="char-c"></span>
          <button class="inpb" title="Emoji" onclick="W.showEmojiInp()">😊</button>
          <button class="inpb" title="GIF" onclick="W.showGifPicker()">GIF</button>
          <button class="inpb" title="Stickers" onclick="W.showStickerPicker()">🎨</button>
          <button class="inpb" title="Sondage" onclick="W.createPollModal()">🗳️</button>
          <button class="inpb" title="Envoyer" onclick="W.send()" style="color:var(--ac)"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
        </div>
      </div>
      <div class="inp-hint"><strong>Entrée</strong> envoyer · <strong>Maj+Entrée</strong> saut de ligne · <strong>**gras**</strong> · <strong>*italique*</strong> · <strong>`code`</strong> · <strong>~~barré~~</strong> · <strong>&gt; citation</strong> · <strong># titre</strong></div>
    </div>
  </main>
  <aside id="mlist" class="hid"></aside>
</div>
<div id="tc"></div>
<div id="mob-overlay" class="mob-overlay" onclick="W._closeAllMobile()"></div>
<div id="voice-bar" class="voice-bar"></div>
<div id="drag-overlay">📁 Dépose ton fichier ici</div>
<script>
'use strict';
const CSRF=()=>document.querySelector('meta[name=csrf]').content;
async function api(a,m='GET',b=null){
  const opts={method:m,headers:{'X-Requested-With':'XMLHttpRequest','X-CSRF':CSRF()}};
  if(b&&m!=='GET'){if(!(b instanceof FormData)){const fd=new FormData();for(const k in b)fd.append(k,b[k]);fd.append('_csrf',CSRF());b=fd;}else b.append('_csrf',CSRF());opts.body=b;}
  try{const r=await fetch('?a='+a,opts);return await r.json();}catch{return{ok:false,error:'Erreur réseau'};}
}
const S={user:null,servers:[],curSrv:null,curCh:null,curDm:null,msgs:[],dmMsgs:[],lastMsgId:0,replyTo:null,poll:null,typTmt:null,pendingFile:null,mode:'home',membersOpen:false,compact:localStorage.getItem('cc_compact')==='1',unread:{},recentEmojis:JSON.parse(localStorage.getItem('cc_emojis')||'[]'),soundOn:localStorage.getItem('cc_sound')!=='0',atMentions:[],atIdx:-1,voiceCh:null,voiceMuted:false,voiceDeafened:false,voicePoll:null,curThread:null,ecdhPriv:null,ecdhPub:null,ecdhPubJwk:null,_dmKeys:{},callPc:null,localStream:null,callDmid:null,callAnswerPoll:null,icePoll:null,callTimer:null,_boostData:null};

// ── Audio ─────────────────────────────────────────────────────────────────────
const SFX={
  msg:()=>S.soundOn&&_beep(880,60,0.08),
  notif:()=>S.soundOn&&_beep(1200,120,0.12),
  join:()=>S.soundOn&&_beep(660,200,0.1),
};
function _beep(freq,dur,vol){try{const ac=new AudioContext();const o=ac.createOscillator();const g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=freq;g.gain.setValueAtTime(vol,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur/1000);o.start();o.stop(ac.currentTime+dur/1000);}catch{}}

// ── Utils ─────────────────────────────────────────────────────────────────────
function toast(msg,type=''){
  const el=document.createElement('div');el.className='toast'+(type?' '+type:'');
  const ic={ok:'✅',err:'❌',warn:'⚠️'}[type]||'💬';
  el.innerHTML=`<span>${ic}</span><span>${h(msg)}</span>`;
  document.getElementById('tc').appendChild(el);
  setTimeout(()=>{el.style.animation='tin .3s reverse';setTimeout(()=>el.remove(),280);},3200);
}
function modal(html,cls=''){
  const bg=document.createElement('div');bg.className='modal-bg';
  bg.innerHTML=`<div class="modal ${cls}">${html}</div>`;
  bg.addEventListener('click',e=>{if(e.target===bg)bg.remove();});
  document.body.appendChild(bg);
  document.body.style.overflow='hidden';
  const orig=bg.remove.bind(bg);
  bg.remove=()=>{orig();if(!document.querySelector('.modal-bg'))document.body.style.overflow='';};
  // Swipe down to close on mobile
  let sy=0;
  const mdEl=bg.querySelector('.modal');
  if(mdEl){
    mdEl.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;},{passive:true});
    mdEl.addEventListener('touchmove',e=>{
      const dy=e.touches[0].clientY-sy;
      if(dy>80&&mdEl.scrollTop===0)bg.remove();
    },{passive:true});
  }
  setTimeout(()=>{const f=bg.querySelector('input:not([type=hidden]):not([type=file]),textarea');if(f)f.focus();},60);
  return bg;
}
function closeModal(){document.querySelectorAll('.modal-bg').forEach(m=>m.remove());}
function h(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function sc(s){const c=['#4F6BF4','#6BCB77','#FF6B6B','#FFD93D','#C77DFF','#F4A261','#43B8E6'];let hv=0;for(let i=0;i<s.length;i++)hv=s.charCodeAt(i)+((hv<<5)-hv);return c[Math.abs(hv)%c.length];}
function stC(s){return{online:'sto',idle:'sti',dnd:'std',offline:'stf',invisible:'stv'}[s]||'stf';}
function stL(s){return{online:'En ligne',idle:'Inactif',dnd:'Ne pas déranger',offline:'Hors ligne',invisible:'Invisible'}[s]||'Hors ligne';}
function scrollBot(force){const m=document.getElementById('msgs');if(!m)return;const atBot=m.scrollHeight-m.scrollTop-m.clientHeight<300;if(force||atBot){m.scrollTop=m.scrollHeight;}}
function stopPoll(){if(S.poll){clearInterval(S.poll);S.poll=null;}}
function showLoad(){const m=document.getElementById('msgs');if(m)m.innerHTML='<div class="loader"><div class="spinner"></div><span>Chargement...</span></div>';}
function togglePw(id){const i=document.getElementById(id);i.type=i.type==='password'?'text':'password';}
function colorDots(cid,iid){document.getElementById(cid)?.querySelectorAll('.cdot').forEach(d=>{d.onclick=function(){document.getElementById(iid).value=this.dataset.c||'';document.getElementById(cid).querySelectorAll('.cdot').forEach(x=>x.classList.remove('sel'));if(this.dataset.c)this.classList.add('sel');};});}
function addRecentEmoji(em){S.recentEmojis=S.recentEmojis.filter(e=>e!==em);S.recentEmojis.unshift(em);S.recentEmojis=S.recentEmojis.slice(0,20);localStorage.setItem('cc_emojis',JSON.stringify(S.recentEmojis));}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(src){
  document.querySelector('.lightbox')?.remove();
  const lb=document.createElement('div');lb.className='lightbox';
  lb.innerHTML=`<div class="lb-bg"></div><div class="lb-cnt"><img src="${h(src)}" class="lb-img"><div class="lb-acts"><a href="${h(src)}" target="_blank" class="btn btn-g btn-sm">⬇️ Télécharger</a><button class="btn btn-g btn-sm" onclick="this.closest('.lightbox').remove()">✕ Fermer</button></div></div>`;
  lb.querySelector('.lb-bg').onclick=()=>lb.remove();
  document.body.appendChild(lb);
  document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){lb.remove();document.removeEventListener('keydown',esc);}});
}

// ── Spoiler ───────────────────────────────────────────────────────────────────
document.addEventListener('click',e=>{const sp=e.target.closest('.spoiler');if(sp)sp.classList.add('revealed');});

// ── Code copy ─────────────────────────────────────────────────────────────────
document.addEventListener('click',e=>{
  const cb=e.target.closest('.cb-copy');
  if(cb){const code=cb.closest('.cb-wrap')?.querySelector('code')?.textContent||'';navigator.clipboard.writeText(code).then(()=>{cb.textContent='✅';setTimeout(()=>cb.textContent='📋',3000);});}
});

// ── Auth ──────────────────────────────────────────────────────────────────────
let authMode='login';
function setMode(m){
  authMode=m;
  document.getElementById('tab-li').classList.toggle('act',m==='login');
  document.getElementById('tab-re').classList.toggle('act',m==='register');
  document.getElementById('af-title').textContent=m==='login'?'Bon retour !':'Créer un compte';
  document.getElementById('af-sub').textContent=m==='login'?'Connecte-toi pour rejoindre ta communauté.':'Rejoins CentCord en quelques secondes.';
  document.getElementById('auth-btn').textContent=m==='login'?'Se connecter':"S'inscrire";
  document.getElementById('f-pw2-g').classList.toggle('hid',m==='login');
  document.getElementById('captcha-group').classList.toggle('hid',m==='login');
  document.getElementById('auth-sw-a').textContent=m==='login'?'Créer un compte':'Se connecter';
  document.getElementById('auth-sw-a').onclick=()=>setMode(m==='login'?'register':'login');
  document.getElementById('auth-err').style.display='none';
  if(m==='register')W.refreshCaptcha();
}
document.getElementById('auth-sw-a').onclick=()=>setMode('register');
document.getElementById('auth-form').onsubmit=async function(ev){
  ev.preventDefault();
  const btn=document.getElementById('auth-btn');btn.disabled=true;btn.textContent='...';
  const un=document.getElementById('f-un').value.trim(),pw=document.getElementById('f-pw').value;
  const errEl=document.getElementById('auth-err');errEl.style.display='none';
  let r;
  if(authMode==='login'){r=await api('login','POST',{username:un,password:pw});}
  else{const pw2=document.getElementById('f-pw2').value;const cap=document.getElementById('f-captcha').value;r=await api('register','POST',{username:un,password:pw,password2:pw2,captcha:cap});}
  btn.disabled=false;btn.textContent=authMode==='login'?'Se connecter':"S'inscrire";
  if(!r.ok){document.getElementById('auth-err-txt').textContent=r.error;errEl.style.display='flex';if(authMode==='register')W.refreshCaptcha();return;}
  document.getElementById('auth-page').classList.add('hid');
  document.getElementById('app').classList.remove('hid');
  await W.boot();
};

// ── Main App ──────────────────────────────────────────────────────────────────
const W={

  async boot(){
    const r=await api('me');
    if(!r.ok){document.getElementById('auth-page').classList.remove('hid');document.getElementById('app').classList.add('hid');return;}
    S.user=r.data;
    document.documentElement.setAttribute('data-theme',S.user.theme||'dark');
    if(S.compact)document.documentElement.setAttribute('data-compact','1');
    await this.loadServers();
    this.renderUB('user-bar');this.renderUB('dm-ub');
    this.showHome();this.pollNotifs();
    this._initDrag();this._initPaste();this._initKeyboard();
  },

  async refreshCaptcha(){const r=await api('captcha.new');if(r.ok)document.getElementById('captcha-q').textContent=r.data.q;},

  async loadServers(){const r=await api('srv.list');if(!r.ok)return;S.servers=r.data;this.renderSrvList();},

  renderSrvList(){
    const el=document.getElementById('srv-list');el.innerHTML='';
    el.appendChild(this._sic('🏠','Accueil',()=>this.showHome(),S.mode==='home',null,false,true));
    const sep=document.createElement('div');sep.className='ssep';el.appendChild(sep);
    S.servers.forEach(s=>{
      const ic=this._sic(null,s.name,()=>this.openServer(s.id),S.curSrv?.id===s.id,s.icon_url);
      el.appendChild(ic);
    });
    const sep2=document.createElement('div');sep2.className='ssep';el.appendChild(sep2);
    const discBtn=this._sic('🔭','Découvrir des serveurs',()=>this.showDiscovery(),false,null,true);
    discBtn.classList.add('sic-disc');el.appendChild(discBtn);
    const bookBtn=this._sic('🔖','Messages sauvegardés',()=>this.showBookmarks(),false,null,true);
    bookBtn.classList.add('sic-disc');el.appendChild(bookBtn);
    const sep3=document.createElement('div');sep3.className='ssep';el.appendChild(sep3);
    const add=this._sic('+','Créer ou rejoindre',()=>this.showAddServer(),false,null,true);add.classList.add('sic-add');el.appendChild(add);
  },

  _sic(emoji,name,onClick,active,imgSrc,isAdd=false,isHome=false){
    const el=document.createElement('div');el.className='sic'+(active?' act':'')+(isHome?' sic-h':'');
    if(imgSrc){const img=document.createElement('img');img.src=imgSrc;img.alt=name;el.appendChild(img);}
    else if(!isAdd){el.textContent=emoji||name.charAt(0).toUpperCase();if(!isHome)el.style.cssText=`background:${sc(name)};color:#fff;font-size:18px;font-weight:800`;}
    else el.textContent='+';
    const pill=document.createElement('div');pill.className='sic-pill';el.appendChild(pill);
    const tip=document.createElement('div');tip.className='sic-tip';tip.textContent=name;el.appendChild(tip);
    el.addEventListener('click',onClick);return el;
  },

  async showHome(){
    S.mode='home';S.curSrv=null;S.curCh=null;S.curDm=null;stopPoll();
    document.getElementById('csb').classList.add('hid');document.getElementById('mlist').classList.add('hid');
    document.getElementById('dm-sb').classList.remove('hid');document.getElementById('main').classList.add('hid');
    document.getElementById('inp-area').classList.add('hid');document.getElementById('home-view').style.display='flex';
    document.getElementById('hdr-pins').style.display='';
    this.renderSrvList();this.renderUB('user-bar');this.renderUB('dm-ub');
    document.getElementById('dm-srch').onclick=()=>this.showAddFriend();
    await this.loadFriends();this._closeMobile();
  },

  async loadFriends(){
    const r=await api('friends.list');if(!r.ok)return;
    const acc=r.data.filter(f=>f.status==='accepted');
    const pending=r.data.filter(f=>f.status==='pending');
    this.renderFriendsList(acc,pending.filter(f=>f.is_incoming),pending.filter(f=>!f.is_incoming));
    this.renderDMList(acc);
  },

  async frTab(tab){
    ['all','pending','blocked'].forEach(t=>document.getElementById('fr-btn-'+t)?.classList.toggle('act',t===tab));
    if(tab==='blocked'){
      const r=await api('friends.blocked');if(!r.ok)return;
      const c=document.getElementById('fr-c');
      c.innerHTML=r.data.length?'<div class="fr-s">Bloqués — '+r.data.length+'</div>'+r.data.map(f=>`<div class="frit"><div class="friv"><img src="${h(f.avatar_url)}" style="width:42px;height:42px;border-radius:50%"></div><div class="frinfo"><div class="frnm">${h(f.username)}</div><div class="frst">Bloqué</div></div><div class="fracts"><button class="frb" onclick="W.removeFriend(${f.id})" title="Débloquer">🚫</button></div></div>`).join('')
        :'<div class="empty"><div class="empty-ic">🚫</div><h3 class="empty-t">Aucun bloqué</h3></div>';
      return;
    }
    await this.loadFriends();
  },

  renderFriendsList(acc,inc,out){
    const c=document.getElementById('fr-c');let hh='';
    if(inc.length){hh+=`<div class="fr-s">Demandes reçues — ${inc.length}</div>`;inc.forEach(f=>hh+=this._frH(f,true));}
    if(out.length){hh+=`<div class="fr-s">Demandes envoyées — ${out.length}</div>`;out.forEach(f=>hh+=this._frH(f,'out'));}
    const on=acc.filter(f=>f.status_str!=='offline'&&f.status_str!=='invisible');
    const off=acc.filter(f=>f.status_str==='offline'||f.status_str==='invisible');
    if(on.length){hh+=`<div class="fr-s">En ligne — ${on.length}</div>`;on.forEach(f=>hh+=this._frH(f));}
    if(off.length){hh+=`<div class="fr-s" style="margin-top:16px">Hors ligne — ${off.length}</div>`;off.forEach(f=>hh+=this._frH(f));}
    if(!hh)hh='<div class="empty"><div class="empty-ic">👋</div><h3 class="empty-t">Aucun ami</h3><p class="empty-d">Ajoute des amis en cliquant sur "Ajouter" !</p></div>';
    c.innerHTML=hh;
  },

  _frH(f,isPending=false){
    const oid=f.other_id;let acts='';
    if(isPending===true)acts=`<button class="frb ok" onclick="W.acceptFriend(${f.id})">✓</button><button class="frb ng" onclick="W.removeFriend(${f.id})">✕</button>`;
    else if(isPending==='out')acts=`<button class="frb ng" onclick="W.removeFriend(${f.id})" title="Annuler">✕</button>`;
    else acts=`<button class="frb" onclick="W.openDM(${oid},'${h(f.username)}','${h(f.avatar_url)}')" title="Message">💬</button><button class="frb ng" onclick="W.removeFriend(${f.id})" title="Retirer">✕</button><button class="frb" onclick="W.blockUser(${oid})" title="Bloquer">🚫</button>`;
    return `<div class="frit"><div class="friv"><img src="${h(f.avatar_url)}"><div class="frist ${stC(f.status_str)}"></div></div><div class="frinfo"><div class="frnm">${h(f.username)}</div><div class="frst">${h(f.custom_status||stL(f.status_str))}</div></div><div class="fracts">${acts}</div></div>`;
  },

  renderDMList(friends){
    const list=document.getElementById('dm-list');list.innerHTML='';
    friends.forEach(f=>{
      const oid=f.other_id;const el=document.createElement('div');
      el.className='dmit'+(S.curDm?.otherId===oid?' act':'');
      el.innerHTML=`<div class="dmav"><img src="${h(f.avatar_url)}"><div class="dmst ${stC(f.status_str)}"></div></div><div style="flex:1;min-width:0"><div class="dmnm">${h(f.username)}</div><div class="dmsc">${h(f.custom_status||stL(f.status_str))}</div></div>`;
      el.onclick=()=>this.openDM(oid,f.username,f.avatar_url);list.appendChild(el);
    });
  },

  async openServer(sid){
    S.mode='server';S.curCh=null;S.curDm=null;stopPoll();
    document.getElementById('dm-sb').classList.add('hid');document.getElementById('home-view').style.display='none';
    document.getElementById('csb').classList.remove('hid');document.getElementById('main').classList.remove('hid');
    showLoad();
    const r=await api('srv.get&sid='+sid);if(!r.ok){toast(r.error,'err');return;}
    S.curSrv=r.data;
    this.renderSrvList();this.renderChanSB();this.renderMemList();
    this._loadBoost(sid);
    let first=null;
    for(const cat of r.data.categories){first=cat.channels.find(c=>c.type==='text'||c.type==='announcement');if(first)break;}
    if(first)this.openChannel(first.id,first.name,first.topic||'',first);
    else{document.getElementById('msgs').innerHTML='<div class="empty"><div class="empty-ic">💬</div><h3 class="empty-t">Aucun salon</h3><p class="empty-d">Crée un salon pour commencer !</p></div>';document.getElementById('inp-area').classList.add('hid');}
    this._closeMobile();
  },

  renderChanSB(){
    const s=S.curSrv;document.getElementById('srv-nm').textContent=s.name;
    const list=document.getElementById('ch-list');list.innerHTML='';
    const VOICE_ICON='<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    const TI={
      voice:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
      text:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      announcement:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/></svg>',
      forum:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>'
    };
    const canM=s.is_owner||(s.permissions&32);
    s.categories.forEach(cat=>{
      const catEl=document.createElement('div');catEl.className='cat-wrap';let chs='';
      cat.channels.forEach(ch=>{
        const isA=S.curCh?.id===ch.id;
        const ccStyle=ch.color?` style="color:${ch.color}"`:'';
        const unCnt=0;
        const badges=(ch.nsfw?'<span class="ch-nsfw">NSFW</span>':'')+(ch.slowmode?`<span class="ch-slow">${ch.slowmode}s</span>`:'')+((ch.locked&&!canM)?'<span class="ch-lock">🔒</span>':'');
        const unBadge='';
        const ab=canM?`<button class="ch-ab" onclick="W.editChannel(${ch.id});event.stopPropagation()" title="Modifier"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="ch-ab" onclick="W.deleteChan(${ch.id});event.stopPropagation()" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>`:'';
        const nm=h(ch.name);const tp=h(ch.topic||'');
        const isVoice=ch.type==='voice';
        chs+=`<div class="ch-item${isA?' act':''}${isVoice?' ch-voice':''}" data-cid="${ch.id}" onclick="${isVoice?'W.joinVoice('+ch.id+',\''+nm+'\')':'W.openChannel('+ch.id+')'}" title="${ch.topic?h(ch.topic):h(ch.name)}"> ${ch.emoji?`<span style="font-size:15px;flex-shrink:0;line-height:1">${h(ch.emoji)}</span>`:`<span class="ch-ico">${TI[ch.type]||TI.voice}</span>`} <span class="ch-n"${ccStyle}>${nm}</span>${badges}<div class="ch-acts">${ab}</div></div>${isVoice?`<div class="voice-users" id="vusers-${ch.id}"></div>`:''}`;
      });
      const addCh=canM?`<button class="cat-ab" onclick="W.createChannel(${s.id},${cat.id});event.stopPropagation()" title="Créer un salon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>`:'';
      const catNm=h(cat.name);
      const editCat=canM?`<button class="cat-ab" onclick="W.editCategory(${cat.id},'${catNm}');event.stopPropagation()" title="Modifier" style="margin-right:2px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/></svg></button>`:'';
      catEl.innerHTML=`<div class="cat-hdr" onclick="this.parentElement.classList.toggle('catcol')"><svg class="cat-cv" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg><span style="flex:1">${catNm}</span>${editCat}${addCh}</div><div class="ch-items">${chs}</div>`;
      list.appendChild(catEl);
    });
    if(canM){const a=document.createElement('div');a.style.cssText='padding:8px 10px;margin-top:4px';a.innerHTML=`<button class="btn btn-g btn-sm btn-full" onclick="W.createCategory(${s.id})" style="justify-content:flex-start;gap:8px;font-size:12px;color:var(--txm)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouvelle catégorie</button>`;list.appendChild(a);}
  },

  renderMemList(){
    const s=S.curSrv,list=document.getElementById('mlist');list.classList.remove('hid');list.innerHTML='';
    const hoisted=s.roles.filter(r=>r.hoist).sort((a,b)=>b.position-a.position);
    const owner=s.members.find(m=>m.is_owner);
    if(owner){list.insertAdjacentHTML('beforeend','<div class="ms-t">Propriétaire — 1</div>');this._renderMem(owner,list,true);}
    hoisted.forEach(role=>{
      const mems=s.members.filter(m=>!m.is_owner&&m.role_names?.split(',').includes(role.name));
      if(!mems.length)return;
      list.insertAdjacentHTML('beforeend',`<div class="ms-t" style="color:${h(role.color)}">${h(role.name)} — ${mems.length}</div>`);
      mems.forEach(m=>this._renderMem(m,list));
    });
    const others=s.members.filter(m=>{if(m.is_owner)return false;return!hoisted.some(r=>m.role_names?.split(',').includes(r.name));});
    if(others.length){list.insertAdjacentHTML('beforeend',`<div class="ms-t">Membres — ${others.length}</div>`);others.forEach(m=>this._renderMem(m,list));}
  },

  _renderMem(m,container,isOwner=false){
    const el=document.createElement('div');el.className='memit';
    const tc=m.role_colors?.split(',')[0]||'var(--tx)';
    el.innerHTML=`<div class="memav"><img src="${h(m.avatar_url)}" loading="lazy"><div class="memst ${stC(m.status)}"></div></div><div class="meminf"><div class="memnm" style="color:${h(tc)}">${h(m.nickname||m.username)}${isOwner?' 👑':''}${m.is_muted?' <span class="memmuted">MUET</span>':''}</div><div class="memrl">${m.role_names?h(m.role_names.split(',')[0]):''}</div></div>`;
    el.onclick=()=>this.showProfile(m.id);container.appendChild(el);
  },

  toggleMembers(){
    S.membersOpen=!S.membersOpen;
    document.getElementById('mlist').classList.toggle('open',S.membersOpen);
    document.getElementById('hdr-mem').classList.toggle('act',S.membersOpen);
    if(S.membersOpen)this._showMobOverlay();else this._closeMobile();
  },

  async openChannel(cid,name,topic,chData){
    if((!name||name===undefined)&&S.curSrv){const _f=S.curSrv.categories.flatMap(c=>c.channels).find(c=>c.id==cid);if(_f){name=_f.name;topic=_f.topic||'';chData=_f;}}
    stopPoll();S.curCh={id:cid,name,topic};S.curDm=null;S.msgs=[];S.lastMsgId=0;S.replyTo=null;
    document.querySelectorAll('.ch-item').forEach(el=>el.classList.toggle('act',el.dataset.cid==cid));
    const ch=chData||S.curSrv?.categories.flatMap(c=>c.channels).find(c=>c.id===cid);
    document.getElementById('chhic').textContent=ch?.emoji||'#';
    document.getElementById('chhnm').textContent=name;
    document.getElementById('chhnm').style.color=ch?.color||'';
    document.getElementById('chhic').style.color=ch?.color||'var(--txm)';
    document.getElementById('chhtp').textContent=topic||'';
    document.getElementById('msg-inp').placeholder=`Écrire dans #${name}...`;
    document.getElementById('inp-area').classList.remove('hid');
    document.getElementById('hdr-pins').style.display='';
    this.clearReply();this.clearFile();showLoad();
    const callBtn=document.getElementById('hdr-call');if(callBtn)callBtn.style.display='none';
    const r=await api('msg.list&cid='+cid);
    if(!r.ok){toast(r.error,'err');return;}
    S.msgs=r.data;S.lastMsgId=r.data.length?r.data[r.data.length-1].id:0;
    this.renderMsgs();scrollBot(true);this._startPoll();this._closeMobile();
    // Mark as read & clear unread
  },

  async loadOlderMsgs(){
    if(!S.curCh)return;
    const firstId=S.msgs.length?S.msgs[0].id:0;
    const r=await api('msg.older&cid='+S.curCh.id+'&before='+firstId);
    if(!r.ok||!r.data.length){toast('Pas de messages plus anciens','warn');return;}
    const area=document.getElementById('msgs');const before=area.firstChild;
    let lastA=null,lastD=null;
    r.data.forEach(m=>{
      const d=m.created_at?.substr(0,10);
      const sepEl=document.createElement('div');sepEl.className='msg-dsep';
      if(d!==lastD){sepEl.textContent=this._fmtDS(m.created_at);area.insertBefore(sepEl,before);}
      area.insertBefore(this._mkMsg(m,lastA!==m.author_id),before);
      lastA=m.author_id;lastD=d;
    });
    S.msgs=[...r.data,...S.msgs];
  },

  renderMsgs(){
    const area=document.getElementById('msgs'),ch=S.curCh;
    const ico=S.curSrv?.categories.flatMap(c=>c.channels).find(c=>c.id===ch.id)?.emoji||'#';
    area.innerHTML=`<div class="ch-wlc"><div class="wlc-ic">${ico}</div><div class="wlc-t">#${h(ch.name)}</div><div class="wlc-d">Bienvenue dans <strong>#${h(ch.name)}</strong>${ch.topic?' — '+h(ch.topic):''}.</div><button class="btn btn-g btn-sm" onclick="W.loadOlderMsgs()" style="margin-top:12px">⬆️ Charger les messages précédents</button></div>`;
    if(!S.msgs.length){area.insertAdjacentHTML('beforeend','<div class="empty"><div class="empty-ic">💭</div><h3 class="empty-t">Encore silencieux</h3><p class="empty-d">Sois le premier à écrire !</p></div>');return;}
    let lastA=null,lastD=null;
    S.msgs.forEach(m=>{
      const d=m.created_at?.substr(0,10);
      if(d!==lastD){area.insertAdjacentHTML('beforeend',`<div class="msg-dsep">${this._fmtDS(m.created_at)}</div>`);lastD=d;lastA=null;}
      area.appendChild(this._mkMsg(m,lastA!==m.author_id));lastA=m.author_id;
    });
  },

  _mkMsg(m,isFirst){
    const me=S.user?.id,isMine=m.author_id==me;
    const canDel=isMine||(S.curSrv&&(S.curSrv.permissions&4));
    const canPin=!!(S.curSrv&&(S.curSrv.permissions&128));
    if(m.type==='system'){const el=document.createElement('div');el.className='sys-msg';el.innerHTML=`<span>🌊</span><span>${m.html}</span>`;return el;}
    // Webhook message
    const isWebhook=m.type==='webhook';
    const avSrc=isWebhook&&m.webhook_avatar?m.webhook_avatar:(m.avatar_url||'');
    const uname=isWebhook?m.webhook_name:(m.display_name||m.nickname||m.username);
    const rHtml=m.reply_to&&m.reply_content?`<div class="mrply"><span style="font-weight:700;color:var(--tx)">@${h(m.reply_user||'?')}</span> ${h(m.reply_content.substr(0,80))}</div>`:'';
    const rxHtml=m.reactions?.length?'<div class="mrxns">'+m.reactions.map(rx=>`<button class="rxb${rx.me?' mine':''}" onclick="W.react(${m.id},'${h(rx.emoji)}')">${rx.emoji} <span class="rxc">${rx.cnt}</span></button>`).join('')+'</div>':'';
    // Process HTML: add copy button to code blocks, handle spoilers
    let html=m.html||'';
    html=html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g,'<div class="cb-wrap"><div class="cb-hdr"><span class="cb-lang">code</span><button class="cb-copy" title="Copier">📋</button></div><pre><code>$1</code></pre></div>');
    html=html.replace(/\|\|([^|]+)\|\|/g,'<span class="spoiler" title="Cliquer pour révéler">$1</span>');
    const attachHtml=m.attachment_url?`<div class="msg-img"><img src="${h(m.attachment_url)}" alt="Image jointe" onclick="openLightbox('${h(m.attachment_url)}')" loading="lazy"></div>`:'';
    // Poll
    let pollHtml='';
    if(m.poll_id){pollHtml=`<div class="poll-wrap" id="poll-${m.poll_id}" data-pid="${m.poll_id}" data-mid="${m.id}"><div class="poll-loading">🗳️ Chargement du sondage...</div></div>`;setTimeout(()=>this._loadPoll(m.poll_id),100);}
    const ts=m.created_at?new Date(m.created_at).toLocaleString('fr-FR'):'';
    const acts=`<div class="macts">
      <button class="mab" onclick="W.showEmojiP(${m.id},this)" title="Réagir">😊</button>
      <button class="mab" onclick="W.setReply(${m.id},'${h(uname)}')" title="Répondre">↩️</button>
      ${isMine?`<button class="mab" onclick="W.editMsg(${m.id})" title="Modifier">✏️</button>`:''}
      ${canPin?`<button class="mab" onclick="W.pinMsg(${m.id})" title="${m.pinned?'Désépingler':'Épingler'}">📌</button>`:''}
      <button class="mab" onclick="W.copyMsg(${m.id})" title="Copier">📋</button>
      <button class="mab" id="bk-${m.id}" onclick="W.toggleBookmark(${m.id})" title="Sauvegarder">🔖</button>
      <button class="mab" onclick="W.createThread(${m.id})" title="Créer un thread">🧵</button>
      <button class="mab" onclick="W.forwardMsg(${m.id})" title="Transférer">↗️</button>
      ${canDel?`<button class="mab dng" onclick="W.delMsg(${m.id})" title="Supprimer">🗑️</button>`:''}
    </div>`;
    const el=document.createElement('div');
    el.className='mi'+(isFirst?' mf':'')+(m.pinned?' pinned':'');el.id='m'+m.id;
    const avHtml=isFirst?`<div class="mav" onclick="W.showProfile(${m.author_id})"><img src="${h(avSrc)}" loading="lazy"></div>`:'<div class="mavsp"></div>';
    const hdrHtml=isFirst?`<div class="mhdr"><span class="mun" style="color:${h(m.accent||'var(--tx)')}" onclick="W.showProfile(${m.author_id})">${h(uname)}</span>${isWebhook?'<span class="wh-badge">WEBHOOK</span>':''}<span class="mts" title="${ts}">${h(m.fmt)}</span>${m.pinned?'<span class="mpin">📌</span>':''}</div>`:'';
    el.innerHTML=`<div>${avHtml}</div><div class="mb">${rHtml}${hdrHtml}<div class="mtx" id="mt${m.id}">${html}</div>${attachHtml}${pollHtml}${m.edited_at?'<span class="medit">(modifié)</span>':''}${rxHtml}</div>${acts}`;
    return el;
  },

  appendMsg(m){
    const area=document.getElementById('msgs');area.querySelector('.empty')?.remove();
    const last=S.msgs[S.msgs.length-1];
    area.appendChild(this._mkMsg(m,!last||last.author_id!==m.author_id));
    S.msgs.push(m);S.lastMsgId=m.id;scrollBot();
    if(m.author_id!==S.user?.id)SFX.msg();
  },

  _startPoll(){
    stopPoll();
    S.poll=setInterval(async()=>{
      if(!S.curCh)return;
      const r=await api(`msg.poll&cid=${S.curCh.id}&last=${S.lastMsgId}`);
      if(r.ok&&r.data.length)r.data.forEach(m=>this.appendMsg(m));
      const rt=await api(`typing.list&cid=${S.curCh.id}`);
      if(rt.ok)this._showTyping(rt.data);
    },3000);
  },

  _startDMPoll(){
    stopPoll();
    S.poll=setInterval(async()=>{
      if(!S.curDm)return;
      const r=await api(`dm.poll&dmid=${S.curDm.id}&last=${S.lastMsgId}`);
      if(r.ok&&r.data.length)r.data.forEach(m=>this._appendDMMsg(m));
      W._pollIncomingCall();
    },3000);
  },

  _showTyping(users){
    const el=document.getElementById('typi');if(!el)return;
    if(!users?.length){el.innerHTML='';return;}
    el.innerHTML=`<div class="tdots"><div class="td"></div><div class="td"></div><div class="td"></div></div><span>${users.map(u=>`<strong>${h(u)}</strong>`).join(', ')} ${users.length===1?'écrit...':'écrivent...'}</span>`;
  },

  async send(){
    const inp=document.getElementById('msg-inp');const content=inp.value.trim();
    if(!content&&!S.pendingFile)return;
    inp.value='';inp.style.height='auto';document.getElementById('char-c').textContent='';
    if(S.curCh){
      const fd=new FormData();fd.append('cid',S.curCh.id);fd.append('content',content);
      if(S.replyTo)fd.append('reply_to',S.replyTo.id);
      if(S.pendingFile)fd.append('file',S.pendingFile);
      this.clearReply();this.clearFile();
      const r=await api('msg.send','POST',fd);
      if(!r.ok){toast(r.error,'err');inp.value=content;return;}
      this.appendMsg(r.data);
    }else if(S.curDm){
      const fd=new FormData();fd.append('dmid',S.curDm.id);fd.append('content',content);
      if(S.pendingFile)fd.append('file',S.pendingFile);
      this.clearReply();this.clearFile();
      const r=await api('dm.send','POST',fd);
      if(!r.ok){toast(r.error,'err');inp.value=content;return;}
      this._appendDMMsg(r.data);
    }
    this._clearAtMention();
  },

  // ── @Mentions autocomplete ─────────────────────────────────────────────────
  _updateAtMention(val,pos){
    const before=val.substr(0,pos);const match=before.match(/@(\w*)$/);
    if(!match||!S.curSrv){this._clearAtMention();return;}
    const q=match[1].toLowerCase();
    const matches=S.curSrv.members.filter(m=>m.username.toLowerCase().startsWith(q)||m.username.toLowerCase().includes(q)).slice(0,6);
    if(!matches.length){this._clearAtMention();return;}
    S.atMentions=matches;S.atIdx=0;this._renderAtList();
  },

  _renderAtList(){
    let pop=document.getElementById('at-pop');
    if(!pop){pop=document.createElement('div');pop.id='at-pop';pop.className='at-pop';document.getElementById('inp-area').appendChild(pop);}
    pop.innerHTML='';
    S.atMentions.forEach((m,i)=>{
      const el=document.createElement('div');el.className='at-item'+(i===S.atIdx?' sel':'');
      el.innerHTML=`<img src="${h(m.avatar_url)}" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"><span style="font-weight:700">${h(m.username)}</span><span style="color:var(--txm);font-size:12px">#${h(m.discriminator)}</span>`;
      el.onclick=()=>this._insertMention(m.username);pop.appendChild(el);
    });
  },

  _insertMention(username){
    const inp=document.getElementById('msg-inp');const val=inp.value;const pos=inp.selectionStart;
    const before=val.substr(0,pos);const after=val.substr(pos);
    const newBefore=before.replace(/@\w*$/,'@'+username+' ');
    inp.value=newBefore+after;inp.selectionStart=inp.selectionEnd=newBefore.length;
    this._clearAtMention();inp.focus();
  },

  _clearAtMention(){S.atMentions=[];S.atIdx=-1;document.getElementById('at-pop')?.remove();},

  onTyping(){
    if(!S.curCh)return;if(S.typTmt)clearTimeout(S.typTmt);
    api('typing.start','POST',{cid:S.curCh.id});S.typTmt=setTimeout(()=>{},8000);
  },

  setReply(mid,username){
    S.replyTo={id:mid,username};
    document.getElementById('rply-txt').innerHTML=`Répondre à <strong style="color:var(--ac)">${h(username)}</strong>`;
    document.getElementById('rply-p').classList.add('vis');document.getElementById('msg-inp').focus();
  },

  clearReply(){S.replyTo=null;document.getElementById('rply-p').classList.remove('vis');},

  onFile(input){
    S.pendingFile=input.files[0];
    document.getElementById('file-pn').textContent=S.pendingFile?.name||'';
    document.getElementById('file-p').classList.toggle('vis',!!S.pendingFile);
    // show preview if image
    const fpv=document.getElementById('file-pv');
    if(fpv){
      if(S.pendingFile?.type.startsWith('image/')){fpv.src=URL.createObjectURL(S.pendingFile);fpv.style.display='block';}
      else fpv.style.display='none';
    }
  },

  clearFile(){
    S.pendingFile=null;document.getElementById('file-p').classList.remove('vis');
    document.getElementById('file-inp').value='';
    const fpv=document.getElementById('file-pv');if(fpv)fpv.style.display='none';
  },

  copyMsg(mid){
    const m=S.msgs.find(m=>m.id===mid)||S.dmMsgs.find(m=>m.id===mid);
    if(!m)return;navigator.clipboard.writeText(m.content||'').then(()=>toast('Message copié !','ok'));
  },

  async forwardMsg(mid){
    const m=S.msgs.find(m=>m.id===mid);if(!m)return;
    // Build list of channels
    const channels=[];
    S.servers.forEach(s=>{
      const srv=S.curSrv?.id===s.id?S.curSrv:null;
      if(!srv)return;
      srv.categories.forEach(cat=>cat.channels.forEach(ch=>channels.push({sid:s.id,sname:s.name,id:ch.id,name:ch.name,emoji:ch.emoji||'#'})));
    });
    if(!channels.length){toast('Ouvre un serveur d\'abord','warn');return;}
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">↗️ Transférer le message</div>
      <div class="ms" style="background:var(--bg3);border-radius:var(--rs);padding:10px;margin-bottom:12px;font-size:13px">${h((m.content||'').substr(0,120))}</div>
      <div class="fg"><label class="fl">Vers le salon</label>
        <select class="fi" id="fwd-ch">${channels.map(c=>`<option value="${c.id}">${c.emoji} #${h(c.name)} (${h(c.sname)})</option>`).join('')}</select>
      </div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="fwd-ok">Transférer</button></div>
    </div>`);
    md.querySelector('#fwd-ok').onclick=async()=>{
      const cid=md.querySelector('#fwd-ch').value;
      const r=await api('msg.send','POST',{cid,content:`> ↗️ Transféré de @${h(m.username)}\n${m.content}`});
      if(!r.ok){toast(r.error,'err');return;}toast('Message transféré !','ok');closeModal();
    };
  },

  async editMsg(mid){
    const txEl=document.getElementById('mt'+mid);const orig=(S.msgs.find(m=>m.id===mid)||{}).content||'';
    const ta=document.createElement('textarea');ta.className='fi';ta.style.cssText='min-height:64px;margin-top:4px;font-size:15px;line-height:1.5';ta.value=orig;
    txEl.replaceWith(ta);ta.focus();ta.select();
    ta.addEventListener('keydown',async e=>{
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        const r=await api('msg.edit','POST',{mid,content:ta.value.trim()});
        if(!r.ok){toast(r.error,'err');return;}
        const nel=document.createElement('div');nel.className='mtx';nel.id='mt'+mid;let html=r.data.html||'';
        html=html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g,'<div class="cb-wrap"><div class="cb-hdr"><span class="cb-lang">code</span><button class="cb-copy">📋</button></div><pre><code>$1</code></pre></div>');
        nel.innerHTML=html;ta.replaceWith(nel);
        const m=S.msgs.find(m=>m.id===mid);if(m){m.content=r.data.content;m.html=r.data.html;}toast('Message modifié','ok');
      }
      if(e.key==='Escape'){const m=S.msgs.find(m=>m.id===mid);const nel=document.createElement('div');nel.className='mtx';nel.id='mt'+mid;nel.innerHTML=m?.html||'';ta.replaceWith(nel);}
    });
  },

  async delMsg(mid){
    if(!confirm('Supprimer ce message ?'))return;
    const r=await api('msg.delete','POST',{mid});if(!r.ok){toast(r.error,'err');return;}
    document.getElementById('m'+mid)?.remove();S.msgs=S.msgs.filter(m=>m.id!==mid);
  },

  async pinMsg(mid){const r=await api('msg.pin','POST',{mid});if(!r.ok){toast(r.error,'err');return;}toast(r.data?.pinned?'Message épinglé 📌':'Message désépinglé','ok');document.getElementById('m'+mid)?.classList.toggle('pinned',r.data?.pinned);},

  async react(mid,emoji){
    addRecentEmoji(emoji);
    const r=await api('react','POST',{mid,emoji});if(!r.ok)return;
    const msgEl=document.getElementById('m'+mid);if(!msgEl)return;
    let rxCont=msgEl.querySelector('.mrxns');
    if(!rxCont){rxCont=document.createElement('div');rxCont.className='mrxns';msgEl.querySelector('.mb').appendChild(rxCont);}
    let existBtn=null;rxCont.querySelectorAll('.rxb').forEach(b=>{if(b.querySelector('span')?.textContent===emoji||b.textContent.trim().startsWith(emoji))existBtn=b;});
    if(existBtn){existBtn.classList.toggle('mine',r.data.added);existBtn.querySelector('.rxc').textContent=r.data.count;if(r.data.count===0)existBtn.remove();}
    else if(r.data.added)rxCont.insertAdjacentHTML('beforeend',`<button class="rxb mine" onclick="W.react(${mid},'${h(emoji)}')">${emoji} <span class="rxc">${r.data.count}</span></button>`);
  },

  showEmojiP(mid,btn){
    document.querySelector('.epick')?.remove();
    const CATS={
      '⏱️ Récents':S.recentEmojis.slice(0,20),
      '😊 Smileys':['😀','😂','😅','🥰','😍','🤩','😎','🤔','😮','😢','😡','🤯','🥳','😴','🤗','😇','🫡','🫠','🥹','😤'],
      '👍 Gestes':['👍','👎','👏','🙌','🤝','🫶','💪','🤞','✌️','🤟','🖖','👌','🤌','🫰','💅','🤙'],
      '❤️ Cœurs':['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
      '🎉 Fête':['🎉','🎊','🎈','🎁','🎀','🥂','🍾','🎆','🎇','✨','🎯','🏆','🥇','🎭','🎪','🎠'],
      '🔥 Populaires':['🔥','💯','✅','⭐','🚀','💎','🌈','⚡','🌟','💫','🎯','🏅','🦋','🌸','🍀','🎸'],
      '😈 Fun':['💀','👻','🤡','👽','🤖','💩','🙈','🙉','🙊','🐱','🦊','🐼','🦁','🐸','🦄','🐉'],
    };
    const pick=document.createElement('div');pick.className='epick epick-full';
    pick.innerHTML=`<div class="ep-search"><input class="ep-si" placeholder="🔍 Rechercher un emoji..." id="ep-search-inp" autocomplete="off"></div><div class="ep-body" id="ep-body"></div>`;
    const renderCat=(filter='')=>{
      const body=pick.querySelector('#ep-body');body.innerHTML='';
      for(const[cat,emojis] of Object.entries(CATS)){
        const filtered=filter?emojis.filter(e=>e.includes(filter)):emojis;
        if(!filtered.length)continue;
        if(!filter){const tt=document.createElement('div');tt.className='ep-t';tt.textContent=cat;body.appendChild(tt);}
        const grid=document.createElement('div');grid.className='ep-grid';
        filtered.forEach(em=>{const b=document.createElement('button');b.className='emb';b.textContent=em;b.title=em;b.onclick=()=>{W.react(mid,em);pick.remove();};grid.appendChild(b);});
        body.appendChild(grid);
      }
    };
    renderCat();
    pick.querySelector('#ep-search-inp').addEventListener('input',e=>renderCat(e.target.value));
    const rect=btn.getBoundingClientRect();
    pick.style.cssText=`left:${Math.min(rect.left,window.innerWidth-320)}px;top:${Math.max(10,rect.top-360)}px`;
    document.body.appendChild(pick);
    pick.querySelector('#ep-search-inp').focus();
    setTimeout(()=>document.addEventListener('click',e=>{if(!pick.contains(e.target))pick.remove();},{once:true}),50);
  },

  showEmojiInp(){
    document.querySelector('.epick')?.remove();
    const CATS=[
      {n:'⏱️',label:'Récents',e:()=>S.recentEmojis.length?S.recentEmojis.slice(0,36):['😀','😂','❤️','👍','🔥','💯','✅','🎉']},
      {n:'😀',label:'Smileys',e:()=>['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','🙂','🤗','🤩','🤔','😐','😶','🙄','😏','😒','😔','😕','🙃','🤑','😲','😢','😭','😤','😠','😡','🤬','😳','😱','🥵','🥶','😴','🥱','🤒','🤢','🥴','😇','🥳','🤠','🥺','🤡','🤖','👻','💀','😈','👿','💩','☠️']},
      {n:'👋',label:'Gestes',e:()=>['👋','🤚','✋','🖖','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🤝','🙏','💪','🤳','💅','🖐️','🤌','🫶','🫰','🤏']},
      {n:'❤️',label:'Cœurs',e:()=>['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🫀']},
      {n:'🎉',label:'Fête',e:()=>['🎉','🎊','🎈','🎁','🎀','🥂','🍾','🎆','🎇','✨','🎯','🏆','🥇','🥈','🥉','🎖️','🏅','🎤','🎧','🎼','🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎨','🎭','🎪','🤹']},
      {n:'🔥',label:'Top',e:()=>['🔥','💯','✅','⭐','🚀','💎','🌈','⚡','🌟','💫','👑','💰','🎯','🍀','🌸','🦋','😈','🤝','💡','⚽','🏀','🎮','🖥️','📱','💻','🔑','🛡️','⚔️','🌍','🌊','☀️','🌙','⛄','🌺','🦄']},
      {n:'🐶',label:'Animaux',e:()=>['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐬','🐳','🦈','🐉']},
      {n:'🍕',label:'Nourriture',e:()=>['🍕','🍔','🍟','🌭','🌮','🌯','🥗','🍝','🍜','🍣','🍱','🍤','🥚','🍳','🥞','🧇','🥩','🌽','🥕','🥦','🥑','🍅','🧀','🍰','🎂','🍩','🍪','🍫','🍭','🍺','🍻','🥂','🍷','☕','🧃','🥤','🧋']},
      {n:'⚽',label:'Sports',e:()=>['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','⛳','🎣','🥊','🥋','🎽','🛹','⛸️','🎿','🏂','🏋️','🤸','🏊','🚴','🏇','🧗','🚵','🎯','🎳','🏆','🥇']},
      {n:'🚀',label:'Voyage',e:()=>['🚀','✈️','🚂','🚗','🚕','🚙','🛻','🚌','🚎','🏎️','🚑','🚒','🚓','🛵','🚲','🛴','🛺','⛵','🚢','🛸','🚁','🛶','🏔️','⛰️','🌋','🗺️','🏕️','🏖️','🏜️','🏝️','🗽','🗼','🏰','🏯']},
      {n:'💡',label:'Objets',e:()=>['💡','🔦','💰','💳','💎','⚖️','🔧','🔨','🔩','🔑','🗝️','🔐','🔒','🔓','📱','💻','🖥️','⌨️','🖱️','📷','📸','📹','📞','📡','🔭','🔬','💊','💉','🩺','🎒','👜','👛','🎩','👑','💍','💄','🪄']},
      {n:'💬',label:'Symboles',e:()=>['💬','💭','🗯️','✅','❌','❓','❗','♻️','🔱','📛','🔰','⭕','✔️','❎','➕','➖','➗','✖️','💲','〰️','🔗','⛔','🚫','🔞','☢️','☣️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳']}
    ];
    let activeTab=S.recentEmojis.length?0:1;
    const pick=document.createElement('div');
    pick.className='epick epick-discord';
    pick.style.cssText='position:fixed;bottom:80px;right:80px;z-index:900;width:352px';
    const renderPicker=(tab,search)=>{
      const emojis=search
        ?CATS.flatMap(c=>c.e()).filter((e,i,a)=>a.indexOf(e)===i).slice(0,72)
        :CATS[tab].e();
      pick.innerHTML=`
        <div class="ep-searchrow"><input class="ep-si" id="ep-si" placeholder="🔍 Rechercher un emoji..." autocomplete="off" value="${search||''}"></div>
        <div class="ep-tabrow">${CATS.map((c,i)=>`<button class="ep-tab${i===tab&&!search?' act':''}" data-tab="${i}" title="${c.label}">${c.n}</button>`).join('')}</div>
        <div class="ep-catname">${search?'Résultats':CATS[tab].label}</div>
        <div class="ep-grid">${emojis.slice(0,72).map(e=>`<button class="emb" data-e="${e}">${e}</button>`).join('')}</div>`;
      pick.querySelector('#ep-si').addEventListener('input',e=>renderPicker(tab,e.target.value));
      pick.querySelector('#ep-si').focus();
      pick.querySelectorAll('.ep-tab').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();activeTab=parseInt(btn.dataset.tab);renderPicker(activeTab,'');}));
      pick.querySelectorAll('.emb').forEach(btn=>btn.addEventListener('click',e=>{
        e.stopPropagation();
        const em=btn.dataset.e;
        const mi=document.getElementById('msg-inp');
        mi.value+=em;mi.focus();
        W._addRecentEmoji(em);
        pick.remove();
      }));
    };
    renderPicker(activeTab,'');
    document.body.appendChild(pick);
    setTimeout(()=>document.addEventListener('click',e=>{if(!pick.contains(e.target))pick.remove();},{once:true}),50);
  },

  _addRecentEmoji(em){
    S.recentEmojis=[em,...S.recentEmojis.filter(e=>e!==em)].slice(0,30);
    localStorage.setItem('cc_emojis',JSON.stringify(S.recentEmojis));
  },

  async showPins(){
    if(!S.curCh)return;const r=await api('msg.pins&cid='+S.curCh.id);if(!r.ok){toast(r.error,'err');return;}
    const items=r.data.length?r.data.map(m=>`<div class="pin-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><img src="${h(m.avatar_url)}" style="width:28px;height:28px;border-radius:50%"><strong>${h(m.username)}</strong><span style="font-size:11px;color:var(--txm)">${h(m.fmt)}</span></div><div style="font-size:14px">${m.html}</div>${m.attachment_url?`<div class="msg-img" style="margin-top:6px"><img src="${h(m.attachment_url)}" style="max-width:200px" onclick="openLightbox('${h(m.attachment_url)}')"></div>`:''}</div>`).join(''):'<div class="empty" style="padding:32px"><div class="empty-ic">📌</div><p>Aucun message épinglé</p></div>';
    modal(`<div><button class="mcls" onclick="closeModal()">✕</button><div class="mt">📌 Messages épinglés</div><div class="ms">${r.data.length} épinglé${r.data.length>1?'s':''} dans #${h(S.curCh.name)}</div><div style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">${items}</div><div class="mft"><button class="btn btn-g" onclick="closeModal()">Fermer</button></div></div>`);
  },

  showSearch(){
    if(!S.curSrv){toast('Sélectionne un serveur');return;}
    const allChs=S.curSrv.categories.flatMap(c=>c.channels);
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🔍 Rechercher dans ${h(S.curSrv.name)}</div>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <div style="flex:1;display:flex;align-items:center;background:var(--bg3);border-radius:var(--rs);padding:8px 14px;gap:8px;border:1px solid var(--bd)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--txm)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="fi" id="s-q" placeholder="Rechercher des messages..." style="background:none;border:none;box-shadow:none;padding:4px 0;font-size:16px" autofocus>
        </div>
        <select class="fi" id="s-ch" style="width:160px">
          <option value="">Tous les salons</option>
          ${allChs.map(c=>`<option value="${c.id}">${c.emoji||'#'} ${h(c.name)}</option>`).join('')}
        </select>
      </div>
      <div id="s-res" style="max-height:360px;overflow-y:auto"><div style="text-align:center;color:var(--txm);padding:24px">Tape pour rechercher...</div></div>
    </div>`);
    let tmt;const doSearch=async()=>{
      clearTimeout(tmt);const q=md.querySelector('#s-q').value.trim();if(q.length<2)return;
      tmt=setTimeout(async()=>{
        const cid=md.querySelector('#s-ch').value;
        const url='search&sid='+S.curSrv.id+'&q='+encodeURIComponent(q)+(cid?'&cid='+cid:'');
        const r=await api(url);if(!r.ok)return;
        md.querySelector('#s-res').innerHTML=r.data.length
          ?r.data.map(m=>`<div class="search-item" onclick="W._jumpToMsg(${m.id},'${m.channel_id}','${h(m.ch_name)}','${h(m.ch_emoji||'')}');closeModal()"><div style="font-size:12px;color:var(--txm);margin-bottom:4px"><img src="${h(m.avatar_url)}" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:4px"><strong>${h(m.username)}</strong> dans <strong>${m.ch_emoji||'#'}${h(m.ch_name)}</strong> <span style="float:right">${h(m.fmt)}</span></div><div>${m.html}</div>${m.attachment_url?`<img src="${h(m.attachment_url)}" style="max-width:100px;max-height:60px;margin-top:4px;border-radius:4px;cursor:pointer" onclick="openLightbox('${h(m.attachment_url)}');event.stopPropagation()">`:''}  </div>`).join('')
          :'<div style="text-align:center;color:var(--txm);padding:24px">Aucun résultat</div>';
      },350);
    };
    md.querySelector('#s-q').addEventListener('input',doSearch);
    md.querySelector('#s-ch').addEventListener('change',doSearch);
  },

  async _jumpToMsg(mid,cid,chName,chEmoji){
    await this.openChannel(cid,chName,'');
    setTimeout(()=>{const el=document.getElementById('m'+mid);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('highlight');setTimeout(()=>el.classList.remove('highlight'),2000);}},500);
  },

  // ── Polls ──────────────────────────────────────────────────────────────────
  async createPollModal(){
    if(!S.curCh)return;
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🗳️ Créer un sondage</div>
      <div class="fg"><label class="fl">Question *</label><input class="fi" id="poll-q" placeholder="Quelle est ta question ?" maxlength="200" required></div>
      <div id="poll-opts">
        <div class="fg"><label class="fl">Options</label><input class="fi poll-opt" placeholder="Option 1" maxlength="100"></div>
        <div class="fg"><input class="fi poll-opt" placeholder="Option 2" maxlength="100"></div>
      </div>
      <button class="btn btn-g btn-sm" id="add-opt" style="margin-bottom:16px">+ Ajouter une option</button>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="poll-ok">🗳️ Créer le sondage</button></div>
    </div>`);
    md.querySelector('#add-opt').onclick=()=>{
      const div=document.createElement('div');div.className='fg';
      const inp=document.createElement('input');inp.className='fi poll-opt';inp.maxLength=100;
      const n=md.querySelectorAll('.poll-opt').length+1;inp.placeholder=`Option ${n}`;
      div.appendChild(inp);md.querySelector('#poll-opts').appendChild(div);inp.focus();
    };
    md.querySelector('#poll-ok').onclick=async()=>{
      const q=md.querySelector('#poll-q').value.trim();
      const opts=[...md.querySelectorAll('.poll-opt')].map(i=>i.value.trim()).filter(Boolean);
      if(!q){toast('Question requise','err');return;}
      if(opts.length<2){toast('Au moins 2 options requises','err');return;}
      const r=await api('msg.send','POST',{cid:S.curCh.id,content:`[POLL] ${q}`,poll_options:JSON.stringify(opts)});
      if(!r.ok){toast(r.error,'err');return;}
      toast('Sondage créé !','ok');closeModal();this.appendMsg(r.data);
    };
  },

  async _loadPoll(pid){
    const wrap=document.getElementById('poll-'+pid);if(!wrap)return;
    const r=await api('poll.get&pid='+pid);
    if(!r.ok){wrap.innerHTML='<div style="color:var(--txm)">Sondage introuvable</div>';return;}
    const p=r.data;this._renderPoll(pid,p);
  },

  _renderPoll(pid,p){
    const wrap=document.getElementById('poll-'+pid);if(!wrap)return;
    const total=p.total||0;const myVote=p.my_vote;const ended=p.ended;
    wrap.innerHTML=`<div class="poll-q">${h(p.question)}</div>
      ${p.options.map((opt,i)=>{
        const cnt=p.counts?.[i]||0;const pct=total?Math.round(cnt/total*100):0;const isMe=myVote===i;
        return `<button class="poll-opt-btn${isMe?' voted':''}" onclick="W._votePoll(${pid},${i})" ${ended?'disabled':''}>
          <div class="poll-fill" style="width:${pct}%"></div>
          <span class="poll-ol">${h(opt)}</span>
          <span class="poll-op">${pct}%</span>
        </button>`;
      }).join('')}
      <div class="poll-ft">${total} vote${total>1?'s':''} · ${ended?'Terminé':'En cours'}${!ended&&wrap.dataset.mid&&wrap.dataset.mid!='undefined'&&(S.curSrv?.is_owner||S.msgs.find(m=>m.id==wrap.dataset.mid)?.author_id==S.user?.id)?` · <button class="btn btn-d btn-sm" onclick="W._endPoll(${pid})" style="padding:2px 8px">Terminer</button>`:''}</div>`;
  },

  async _votePoll(pid,opt){
    const r=await api('poll.vote','POST',{pid,option:opt});
    if(!r.ok){toast(r.error,'err');return;}
    const wrap=document.getElementById('poll-'+pid);if(!wrap)return;
    const mid=wrap.dataset.mid;const msg=S.msgs.find(m=>m.id==mid);
    const p=r.data;p.question=wrap.querySelector('.poll-q')?.textContent||'';
    p.options=[...wrap.querySelectorAll('.poll-opt-btn')].map(b=>b.querySelector('.poll-ol')?.textContent||'');
    this._renderPoll(pid,p);
  },

  async _endPoll(pid){
    const r=await api('poll.end','POST',{pid});if(!r.ok){toast(r.error,'err');return;}
    toast('Sondage terminé','ok');this._loadPoll(pid);
  },

  // ── DM ─────────────────────────────────────────────────────────────────────
  async openDM(uid,username,avatarUrl){
    S.mode='dm';S.curCh=null;S.msgs=[];S.lastMsgId=0;stopPoll();
    const r=await api('dm.open&tid='+uid);if(!r.ok){toast(r.error,'err');return;}
    S.curDm={id:r.data.id,otherId:uid};
    document.getElementById('home-view').style.display='none';
    document.getElementById('csb').classList.add('hid');document.getElementById('mlist').classList.add('hid');
    document.getElementById('dm-sb').classList.remove('hid');document.getElementById('main').classList.remove('hid');
    document.getElementById('inp-area').classList.remove('hid');document.getElementById('hdr-pins').style.display='none';
    document.getElementById('chhic').textContent='💬';
    // Show call button in header
    S._dmCallUsername=username;
    const callBtn=document.getElementById('hdr-call');
    if(callBtn){callBtn.style.display='';callBtn.title='Appeler '+username;}document.getElementById('chhic').style.color='var(--ac)';
    document.getElementById('chhnm').textContent=username;document.getElementById('chhnm').style.color='';
    document.getElementById('chhtp').textContent='Message direct';
    document.getElementById('msg-inp').placeholder=`Écrire à ${username}...`;
    this.clearReply();this.clearFile();showLoad();
    const rm=await api('dm.messages&dmid='+r.data.id);
    if(rm.ok){
      let dmMsgs=rm.data;
      if(S.ecdhPriv&&S.curDm)dmMsgs=await this._decryptDMMsgs(dmMsgs,S.curDm.otherId);
      S.dmMsgs=dmMsgs;S.lastMsgId=dmMsgs.length?dmMsgs[dmMsgs.length-1].id:0;
      this._renderDMMsgs(dmMsgs,username);
    }
    this._startDMPoll();this._closeMobile();
  },

  _renderDMMsgs(msgs,username){
    const area=document.getElementById('msgs');
    area.innerHTML=`<div class="ch-wlc"><div class="wlc-ic">💬</div><div class="wlc-t">${h(username)}</div><div class="wlc-d">Début de ta conversation avec <strong>${h(username)}</strong>.</div></div><div class="dm-e2e-notice">🔒 Les messages sont chiffrés en AES-256-GCM avec échange de clés ECDH si les deux parties sont connectées.</div>`;
    let lastA=null;msgs.forEach(m=>{area.appendChild(this._mkDMMsg(m,lastA!==m.author_id));lastA=m.author_id;});scrollBot(true);
  },

  _mkDMMsg(m,isFirst){
    const el=document.createElement('div');el.className='mi'+(isFirst?' mf':'');el.id='m'+m.id;
    const isMine=m.author_id==S.user?.id;
    const attachHtml=m.attachment_url?`<div class="msg-img"><img src="${h(m.attachment_url)}" onclick="openLightbox('${h(m.attachment_url)}')" loading="lazy"></div>`:'';
    el.innerHTML=`<div>${isFirst?`<div class="mav"><img src="${h(m.avatar_url)}" loading="lazy"></div>`:'<div class="mavsp"></div>'}</div><div class="mb">${isFirst?`<div class="mhdr"><span class="mun">${h(m.username)}</span><span class="mts">${h(m.fmt)}</span></div>`:''}<div class="mtx">${m.html}</div>${attachHtml}</div><div class="macts">${isMine?`<button class="mab dng" onclick="W._delDMMsg(${m.id})" title="Supprimer">🗑️</button>`:''}<button class="mab" onclick="W.copyMsg(${m.id})" title="Copier">📋</button>
      <button class="mab" id="bk-${m.id}" onclick="W.toggleBookmark(${m.id})" title="Sauvegarder">🔖</button>
      <button class="mab" onclick="W.createThread(${m.id})" title="Créer un thread">🧵</button></div>`;
    return el;
  },

  _appendDMMsg(m){
    const last=S.dmMsgs[S.dmMsgs.length-1];
    document.getElementById('msgs').appendChild(this._mkDMMsg(m,!last||last.author_id!==m.author_id));
    S.dmMsgs.push(m);S.lastMsgId=m.id;scrollBot();
    if(m.author_id!==S.user?.id)SFX.msg();
  },

  async _delDMMsg(mid){
    if(!confirm('Supprimer ce message ?'))return;
    const r=await api('msg.delete','POST',{mid});if(!r.ok){toast(r.error,'err');return;}
    document.getElementById('m'+mid)?.remove();S.dmMsgs=S.dmMsgs.filter(m=>m.id!==mid);
  },

  // ── Friends ─────────────────────────────────────────────────────────────────
  showAddFriend(){
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">Ajouter un ami</div>
      <div class="ms">Cherche un utilisateur par son pseudo.</div>
      <div class="fg"><input class="fi" id="fr-si" placeholder="Rechercher un pseudo..." autocomplete="off" autofocus></div>
      <div id="fr-sr"></div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Fermer</button></div>
    </div>`);
    let tmt;md.querySelector('#fr-si').addEventListener('input',async e=>{
      clearTimeout(tmt);const q=e.target.value.trim();if(q.length<2){md.querySelector('#fr-sr').innerHTML='';return;}
      tmt=setTimeout(async()=>{
        const r=await api('users.search&q='+encodeURIComponent(q));if(!r.ok)return;
        md.querySelector('#fr-sr').innerHTML=r.data.length
          ?r.data.map(u=>`<div class="search-item" style="display:flex;align-items:center;gap:12px"><img src="${h(u.avatar_url)}" style="width:38px;height:38px;border-radius:50%"><div style="flex:1"><div style="font-weight:700">${h(u.username)}</div><div style="font-size:12px;color:var(--txm)">#${h(u.discriminator)} · ${h(stL(u.status))}</div></div><button class="btn btn-s btn-sm" onclick="W.sendFriendReq(${u.id})">Ajouter</button></div>`).join('')
          :'<div style="text-align:center;color:var(--txm);padding:20px">Aucun résultat</div>';
      },300);
    });
  },

  async sendFriendReq(tid){const r=await api('friends.send','POST',{tid});if(!r.ok){toast(r.error,'err');return;}toast('Demande envoyée ! 🎉','ok');closeModal();},
  async acceptFriend(fid){const r=await api('friends.accept','POST',{fid});if(!r.ok){toast(r.error,'err');return;}toast('Ami accepté !','ok');this.loadFriends();},
  async removeFriend(fid){const r=await api('friends.remove','POST',{fid});if(!r.ok){toast(r.error,'err');return;}this.loadFriends();},
  async blockUser(tid){if(!confirm('Bloquer cet utilisateur ?'))return;const r=await api('friends.block','POST',{tid});if(!r.ok){toast(r.error,'err');return;}toast('Utilisateur bloqué');this.loadFriends();},

  // ── Server management ──────────────────────────────────────────────────────
  showAddServer(){
    const COLS=['#4F6BF4','#C77DFF','#6BCB77','#FF6B6B','#FFD93D','#43B8E6','#F4A261','#ED4245'];
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">Ajouter un serveur</div>
      <div class="m-tabs">
        <div class="mtab act" id="tab-cs" onclick="this.classList.add('act');document.getElementById('tab-js').classList.remove('act');document.getElementById('cs-f').classList.remove('hid');document.getElementById('js-f').classList.add('hid')">🏗 Créer</div>
        <div class="mtab" id="tab-js" onclick="this.classList.add('act');document.getElementById('tab-cs').classList.remove('act');document.getElementById('js-f').classList.remove('hid');document.getElementById('cs-f').classList.add('hid')">🔗 Rejoindre</div>
      </div>
      <form id="cs-f">
        <div class="fg"><label class="fl">Nom du serveur *</label><input class="fi" id="cs-nm" placeholder="Mon serveur" maxlength="100" required></div>
        <div class="fg"><label class="fl">Description</label><textarea class="fi" id="cs-desc" placeholder="À propos..." maxlength="300" rows="2"></textarea></div>
        <div class="fg"><label class="fl">Couleur</label><div class="c-row"><input type="color" class="fi-color" id="cs-col" value="#4F6BF4"><div class="c-dots" id="cs-dots">${COLS.map(c=>`<div class="cdot" data-c="${c}" style="background:${c}"></div>`).join('')}</div></div></div>
        <div class="fg"><label class="fl">Icône (optionnel)</label><input type="file" class="fi" id="cs-ico" accept="image/*" style="padding:8px"></div>
        <div class="mft"><button type="button" class="btn btn-g" onclick="closeModal()">Annuler</button><button type="submit" class="btn btn-p">Créer le serveur 🚀</button></div>
      </form>
      <form id="js-f" class="hid">
        <div class="fg"><label class="fl">Code d'invitation *</label><input class="fi" id="js-code" placeholder="Ex: ABCD1234" maxlength="10" style="font-family:var(--mo);font-size:18px;letter-spacing:4px;text-transform:uppercase" required></div>
        <div class="mft"><button type="button" class="btn btn-g" onclick="closeModal()">Annuler</button><button type="submit" class="btn btn-p">Rejoindre !</button></div>
      </form>
    </div>`,'modal-w');
    colorDots('cs-dots','cs-col');
    md.querySelector('#cs-f').onsubmit=async e=>{
      e.preventDefault();const fd=new FormData();
      fd.append('name',document.getElementById('cs-nm').value.trim());fd.append('description',document.getElementById('cs-desc').value.trim());fd.append('color',document.getElementById('cs-col').value);
      const ico=document.getElementById('cs-ico').files[0];if(ico)fd.append('icon',ico);
      const r=await api('srv.create','POST',fd);if(!r.ok){toast(r.error,'err');return;}
      toast('Serveur créé ! 🎉','ok');closeModal();await this.loadServers();this.openServer(r.data.id);
    };
    md.querySelector('#js-f').onsubmit=async e=>{
      e.preventDefault();const code=document.getElementById('js-code').value.trim().toUpperCase();
      const r=await api('invite.use','POST',{code});if(!r.ok){toast(r.error,'err');return;}
      toast('Serveur rejoint !','ok');closeModal();await this.loadServers();this.openServer(r.data.id);
    };
  },

  showServerCtx(e){
    e.preventDefault();const s=S.curSrv;if(!s)return;
    document.querySelector('.ctx')?.remove();
    const ctx=document.createElement('div');ctx.className='ctx';
    ctx.style.cssText=`left:${Math.min(e.clientX,window.innerWidth-220)}px;top:${Math.min(e.clientY,window.innerHeight-280)}px`;
    const items=[
      {icon:'🚀',label:'Booster le serveur',fn:()=>this.toggleBoost()},{icon:'🔭',label:'Paramètres de découverte',fn:()=>this.showDiscoverySettings()},{icon:'😄',label:'Emojis personnalisés',fn:()=>this.showCustomEmojiManager()},
      {icon:'🔗',label:"Copier le lien d'invitation",fn:()=>{navigator.clipboard.writeText(location.origin+location.pathname+'?invite='+s.invite_code).then(()=>toast('Lien copié !','ok'));}},
      {icon:'🎫',label:"Créer un lien personnalisé",fn:()=>this.showInviteModal()},
      {icon:'⚙️',label:'Paramètres du serveur',fn:()=>this.showSrvSettings()},
      {icon:'🔄',label:'Regénérer le lien',fn:async()=>{const r=await api('srv.regen','POST',{sid:s.id});if(r.ok){s.invite_code=r.data.invite_code;toast('Nouveau code : '+r.data.invite_code,'ok');}}},
      {icon:'📊',label:'Statistiques',fn:()=>this.showSrvStats()},
      {sep:true}
    ];
    if(s.is_owner)items.push({icon:'🗑️',label:'Supprimer le serveur',dng:true,fn:()=>this._delSrv()});
    else items.push({icon:'🚪',label:'Quitter le serveur',dng:true,fn:()=>this._leaveSrv()});
    ctx.innerHTML=items.map(it=>it.sep?'<div class="cxsep"></div>':`<div class="cxi${it.dng?' dng':''}">${it.icon} ${h(it.label)}</div>`).join('');
    document.body.appendChild(ctx);
    // Build clickable items list (excluding seps)
    const clickableItems=items.filter(it=>!it.sep);
    ctx.querySelectorAll('.cxi').forEach((el,i)=>{
      const item=clickableItems[i];
      if(item)el.onclick=()=>{document.removeEventListener('click',closeCtx);ctx.remove();item.fn();};
    });
    function closeCtx(){ctx.remove();}
    setTimeout(()=>document.addEventListener('click',closeCtx,{once:true}),50);
  },

  showInviteModal(){
    const s=S.curSrv;
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🎫 Créer un lien d'invitation</div>
      <div class="fg"><label class="fl">Expire après</label>
        <select class="fi" id="inv-exp">
          <option value="0">Jamais</option><option value="1">1 heure</option><option value="6">6 heures</option>
          <option value="12">12 heures</option><option value="24" selected>24 heures</option>
          <option value="168">7 jours</option><option value="720">30 jours</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Utilisations max</label>
        <select class="fi" id="inv-uses">
          <option value="0">Illimité</option><option value="1">1</option><option value="5">5</option>
          <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option>
        </select>
      </div>
      <div id="inv-result" class="hid" style="margin-bottom:16px">
        <div style="font-size:13px;color:var(--txm);margin-bottom:6px">Lien d'invitation :</div>
        <div style="display:flex;gap:8px;align-items:center;background:var(--bg3);border-radius:var(--rs);padding:10px 14px">
          <code id="inv-link" style="flex:1;font-size:13px;color:var(--ac)"></code>
          <button class="btn btn-s btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('inv-link').textContent).then(()=>toast('Copié !','ok'))">📋 Copier</button>
        </div>
      </div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Fermer</button><button class="btn btn-p" id="inv-gen">Générer</button></div>
    </div>`);
    md.querySelector('#inv-gen').onclick=async()=>{
      const exp=md.querySelector('#inv-exp').value;const uses=md.querySelector('#inv-uses').value;
      const r=await api('invite.create','POST',{sid:s.id,expires_hours:exp,max_uses:uses});
      if(!r.ok){toast(r.error,'err');return;}
      const link=location.origin+location.pathname+'?invite='+r.data.code;
      md.querySelector('#inv-link').textContent=link;md.querySelector('#inv-result').classList.remove('hid');
    };
  },

  async showSrvStats(){
    const s=S.curSrv;const r=await api('srv.stats&sid='+s.id);if(!r.ok){toast(r.error,'err');return;}
    const d=r.data;const days=Object.entries(d.msgs_per_day);
    const max=Math.max(...days.map(([,v])=>v),1);
    modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">📊 Statistiques de ${h(s.name)}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        ${[['💬',d.msg_count,'Messages'],['👥',d.member_count,'Membres'],['📢',d.chan_count,'Salons'],['🎭',d.role_count,'Rôles']].map(([ic,v,lbl])=>`<div style="background:var(--bg3);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--bd)"><div style="font-size:28px">${ic}</div><div style="font-size:24px;font-weight:800;color:var(--ac)">${v}</div><div style="font-size:12px;color:var(--txm)">${lbl}</div></div>`).join('')}
      </div>
      <div class="sett-s">Messages des 7 derniers jours</div>
      <div style="display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:20px;padding:0 4px">
        ${days.map(([day,cnt])=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${day}: ${cnt} messages"><div style="flex:1;min-height:4px;width:100%;background:var(--ac);border-radius:4px 4px 0 0;opacity:${0.3+0.7*(cnt/max)};height:${Math.max(4,cnt/max*100)}%;transition:height .3s"></div><div style="font-size:9px;color:var(--txm);transform:rotate(-45deg);white-space:nowrap">${day.slice(5)}</div></div>`).join('')}
      </div>
      <div class="sett-s">Top contributeurs</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${d.top_users.map((u,i)=>`<div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span><img src="${h(u.avatar_url)}" style="width:32px;height:32px;border-radius:50%"><span style="flex:1;font-weight:600">${h(u.username)}</span><span style="font-size:13px;color:var(--txm)">${u.count} messages</span></div>`).join('')}
      </div>
      <div class="mft" style="margin-top:20px"><button class="btn btn-g" onclick="closeModal()">Fermer</button></div>
    </div>`,'modal-w');
  },

  async _delSrv(){
    const s=S.curSrv;
    if(!confirm('⚠️ Supprimer "'+s.name+'" ? Cette action est IRRÉVERSIBLE.'))return;
    const name=prompt('Tape le nom du serveur pour confirmer : '+s.name);
    if(!name||name.trim().toLowerCase()!==s.name.trim().toLowerCase())return;
    const btn_r=await api('srv.delete','POST',{sid:s.id});
    if(!btn_r.ok){toast(btn_r.error,'err');return;}
    S.curSrv=null;await this.loadServers();this.showHome();toast('Serveur supprimé','ok');
  },
  async _leaveSrv(){const s=S.curSrv;if(!confirm(`Quitter "${s.name}" ?`))return;const r=await api('srv.leave','POST',{sid:s.id});if(!r.ok){toast(r.error,'err');return;}S.curSrv=null;await this.loadServers();this.showHome();},

  showSrvSettings(){
    const s=S.curSrv;
    const md=modal(`<div style="padding:0;min-height:460px;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--bd)">
        <div class="mt" style="margin:0">⚙️ Paramètres de ${h(s.name)}</div>
        <button class="btn btn-g btn-sm" onclick="closeModal()">✕ Fermer</button>
      </div>
      <div class="sett-wrap" style="flex:1;overflow:hidden">
        <div class="sett-nav">
          <div class="sett-nt">Serveur</div>
          <div class="sett-ni act" data-t="general">🏠 Général</div>
          <div class="sett-ni" data-t="roles">🎭 Rôles</div>
          <div class="sett-ni" data-t="members">👥 Membres</div>
          <div class="sett-ni" data-t="bans">🔨 Bans</div>
          <div class="sett-ni" data-t="audit">📋 Journal</div>
          <div class="sett-ni" data-t="webhooks">🔗 Webhooks</div>
        </div>
        <div class="sett-c" id="srv-tab"></div>
      </div>
    </div>`,'modal-xl');

    const show=(tab)=>{
      md.querySelectorAll('.sett-ni[data-t]').forEach(el=>el.classList.toggle('act',el.dataset.t===tab));
      const c=document.getElementById('srv-tab');c.innerHTML='';
      if(tab==='general'){
        c.innerHTML=`<div class="sett-s">Informations générales</div>
          <form id="srv-gf">
            <div class="fg"><label class="fl">Nom du serveur</label><input class="fi" id="srv-nm" value="${h(s.name)}" maxlength="100" required></div>
            <div class="fg"><label class="fl">Description</label><textarea class="fi" id="srv-desc" rows="3" maxlength="300" placeholder="À propos...">${h(s.description||'')}</textarea></div>
            <div class="fg"><label class="fl">Icône</label><input type="file" class="fi" id="srv-ico-up" accept="image/*" style="padding:8px"></div>
            <div class="fg"><label class="fl">Bannière</label><input type="file" class="fi" id="srv-ban-up" accept="image/*" style="padding:8px"></div>
            <button type="submit" class="btn btn-p">💾 Enregistrer</button>
          </form>`;
        c.querySelector('#srv-gf').onsubmit=async e=>{
          e.preventDefault();const fd=new FormData();
          fd.append('sid',s.id);fd.append('name',c.querySelector('#srv-nm').value.trim());fd.append('description',c.querySelector('#srv-desc').value.trim());
          const ico=c.querySelector('#srv-ico-up').files[0];if(ico)fd.append('icon',ico);
          const ban=c.querySelector('#srv-ban-up').files[0];if(ban)fd.append('banner',ban);
          const r=await api('srv.update','POST',fd);if(!r.ok){toast(r.error,'err');return;}
          toast('Serveur mis à jour !','ok');const rr=await api('srv.get&sid='+s.id);if(rr.ok){S.curSrv=rr.data;W.renderSrvList();}
        };
      }else if(tab==='roles'){
        const loadRoles=async()=>{
          const r=await api('srv.get&sid='+s.id);if(!r.ok)return;
          const roles=r.data.roles;
          c.innerHTML=`<div class="sett-s">Rôles (${roles.length})</div>
            <button class="btn btn-s btn-sm" style="margin-bottom:16px" onclick="W._createRole(${s.id})">+ Créer un rôle</button>
            <div>${roles.map(role=>`<div class="search-item" style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="W._editRole(${role.id},'${h(role.name)}','${h(role.color||'')}',${role.permissions},${role.hoist?1:0})">
              <div style="width:14px;height:14px;border-radius:50%;background:${h(role.color||'#747f8d')};flex-shrink:0"></div>
              <div style="flex:1;font-weight:600">${h(role.name)}</div>
              <div style="font-size:12px;color:var(--txm)">${r.data.members.filter(m=>m.role_names?.split(',').includes(role.name)).length} membre(s)</div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`).join('')}</div>`;
        };loadRoles();
      }else if(tab==='members'){
        const loadMem=async()=>{
          const r=await api('srv.get&sid='+s.id);if(!r.ok)return;
          c.innerHTML=`<div class="sett-s">Membres (${r.data.members.length})</div>
            <input class="fi" id="mem-search" placeholder="🔍 Filtrer les membres..." style="margin-bottom:12px" oninput="this.nextElementSibling.querySelectorAll('.mem-row').forEach(el=>el.style.display=el.dataset.name?.includes(this.value.toLowerCase())?'':'none')">
            <div style="max-height:360px;overflow-y:auto">${r.data.members.map(m=>`<div class="mem-row search-item" data-name="${h((m.nickname||m.username).toLowerCase())}">
              <div style="display:flex;align-items:center;gap:10px">
                <img src="${h(m.avatar_url)}" style="width:36px;height:36px;border-radius:50%">
                <div style="flex:1">
                  <div style="font-weight:600">${h(m.nickname||m.username)}${m.is_owner?' 👑':''}</div>
                  <div style="font-size:12px;color:var(--txm)">${h(m.role_names||'Aucun rôle')}</div>
                </div>
                ${!m.is_owner&&m.id!==S.user?.id?`<div style="display:flex;gap:4px">
                  <button class="btn btn-o btn-sm" onclick="W._assignRole(${s.id},${m.id},'${h(m.role_names||'')}')" title="Gérer les rôles">🎭</button>
                  <button class="btn btn-o btn-sm" onclick="W._nickModal(${s.id},${m.id},'${h(m.nickname||'')}','${h(m.username)}')" title="Pseudo">✏️</button>
                  <button class="btn btn-o btn-sm" onclick="W._modMember(${s.id},${m.id},'mute')" title="${m.is_muted?'Démute':'Mute'}">${m.is_muted?'🔊':'🔇'}</button>
                  <button class="btn btn-d btn-sm" onclick="W._kickMember(${s.id},${m.id},'${h(m.username)}')" title="Kick">👢</button>
                  <button class="btn btn-d btn-sm" onclick="W._banMember(${s.id},${m.id},'${h(m.username)}')" title="Ban">🔨</button>
                </div>`:''}</div>
            </div>`).join('')}</div>`;
        };loadMem();
      }else if(tab==='bans'){
        const loadBans=async()=>{
          const r=await api('mod.bans&sid='+s.id);if(!r.ok)return;
          c.innerHTML=`<div class="sett-s">Bannis (${r.data.length})</div>
            <div>${r.data.length?r.data.map(b=>`<div class="search-item" style="display:flex;align-items:center;gap:10px">
              <img src="${h(b.avatar_url)}" style="width:36px;height:36px;border-radius:50%">
              <div style="flex:1"><div style="font-weight:600">${h(b.username)}</div><div style="font-size:12px;color:var(--txm)">${h(b.reason||'Aucune raison')}</div></div>
              <button class="btn btn-o btn-sm" onclick="W._unban(${s.id},${b.id})">Débannir</button>
            </div>`).join(''):'<div class="empty" style="padding:32px"><div class="empty-ic">🔨</div><p>Aucun ban</p></div>'}</div>`;
        };loadBans();
      }else if(tab==='audit'){
        const loadAudit=async()=>{
          const r=await api('audit.list&sid='+s.id);if(!r.ok)return;
          const ICONS={member_join:'👋',member_leave:'🚪',member_kick:'👢',member_ban:'🔨',member_unban:'✅',channel_create:'📢',channel_delete:'🗑️',channel_update:'✏️',role_create:'🎭',role_delete:'🗑️',role_update:'✏️',message_delete:'💬',server_update:'⚙️'};
          c.innerHTML=`<div class="sett-s">Journal des actions</div>
            <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
              ${r.data.length?r.data.map(log=>`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:var(--rs);background:var(--bg3);border:1px solid var(--bd)">
                <span style="font-size:18px;flex-shrink:0">${ICONS[log.action]||'📝'}</span>
                <div><div style="font-size:13px;font-weight:600">${h(log.action)}</div><div style="font-size:12px;color:var(--txm)">${h(log.detail)}</div><div style="font-size:11px;color:var(--txm);margin-top:2px">${h(log.created_at||'')}</div></div>
              </div>`).join(''):'<div class="empty" style="padding:32px"><div class="empty-ic">📋</div><p>Aucune action enregistrée</p></div>'}
            </div>`;
        };loadAudit();
      }else if(tab==='webhooks'){
        const loadWH=async()=>{
          const chList=s.categories.flatMap(cat=>cat.channels);
          const r=await api('webhook.list&sid='+s.id);
          const list=r.ok?r.data:[];
          c.innerHTML=`<div class="sett-s">Webhooks (${list.length})</div>
            <div id="wh-list" style="margin-bottom:16px">${list.length?list.map(wh=>`<div class="search-item" style="display:flex;align-items:center;gap:10px">
              <div style="flex:1"><div style="font-weight:600">${h(wh.name)}</div><div style="font-size:12px;color:var(--txm)">Token: <code style="font-size:11px">${h(wh.token)}</code></div></div>
              <button class="btn btn-g btn-sm" onclick="navigator.clipboard.writeText('${location.origin+location.pathname}?a=webhook.send&token=${h(wh.token)}').then(()=>toast('URL copiée !','ok'))">📋 URL</button>
              <button class="btn btn-d btn-sm" onclick="W._delWebhook(${wh.id})">🗑️</button>
            </div>`).join(''):'<div style="color:var(--txm);font-size:13px;margin-bottom:8px">Aucun webhook.</div>'}</div>
            <div class="sett-s">Créer un webhook</div>
            <div class="fg"><label class="fl">Nom</label><input class="fi" id="wh-nm" placeholder="Mon webhook" maxlength="80"></div>
            <div class="fg"><label class="fl">Salon</label>
              <select class="fi" id="wh-ch">${chList.map(ch=>`<option value="${ch.id}">${ch.emoji||'#'} ${h(ch.name)}</option>`).join('')}</select>
            </div>
            <button class="btn btn-p" id="wh-create">Créer le webhook</button>`;
          c.querySelector('#wh-create').onclick=async()=>{
            const nm=c.querySelector('#wh-nm').value.trim();const cid=c.querySelector('#wh-ch').value;
            if(!nm){toast('Nom requis','err');return;}
            const r=await api('webhook.create','POST',{sid:s.id,cid,name:nm});if(!r.ok){toast(r.error,'err');return;}
            toast('Webhook créé !','ok');loadWH();
          };
        };loadWH();
      }
    };
    md.querySelectorAll('.sett-ni[data-t]').forEach(el=>el.addEventListener('click',()=>show(el.dataset.t)));
    show('general');
  },

  async _createRole(sid){
    const nm=prompt('Nom du rôle :');if(!nm)return;
    const r=await api('role.create','POST',{sid,name:nm});if(!r.ok){toast(r.error,'err');return;}toast('Rôle créé !','ok');
  },

  _editRole(rid,name,color,perms,hoist){
    const PERMS=[{v:4,l:'Supprimer messages'},{v:8,l:'Bannir membres'},{v:16,l:'Kick membres'},{v:32,l:'Gérer les salons'},{v:64,l:'Gérer les rôles'},{v:128,l:'Épingler messages'},{v:256,l:'Gérer le serveur'}];
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🎭 Modifier le rôle</div>
      <form id="role-f">
        <div class="fg"><label class="fl">Nom</label><input class="fi" id="r-nm" value="${h(name)}" maxlength="100"></div>
        <div class="fg"><label class="fl">Couleur</label><input type="color" class="fi-color" id="r-col" value="${h(color||'#747f8d')}"></div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:16px;font-size:13px"><input type="checkbox" id="r-hoist" ${hoist?'checked':''}> Afficher séparément dans la liste</label>
        <div class="sett-s">Permissions</div>
        ${PERMS.map(p=>`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;font-size:13px"><input type="checkbox" class="r-perm" data-v="${p.v}" ${(perms&p.v)?'checked':''}> ${p.l}</label>`).join('')}
        <div class="mft">
          <button type="button" class="btn btn-d btn-sm" onclick="W._deleteRole(${rid})">🗑️ Supprimer</button>
          <div style="flex:1"></div>
          <button type="button" class="btn btn-g" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-p">💾 Enregistrer</button>
        </div>
      </form>
    </div>`);
    md.querySelector('#role-f').onsubmit=async e=>{
      e.preventDefault();let p=0;md.querySelectorAll('.r-perm:checked').forEach(cb=>p|=parseInt(cb.dataset.v));
      const r=await api('role.update','POST',{rid,name:md.querySelector('#r-nm').value.trim(),color:md.querySelector('#r-col').value,permissions:p,hoist:md.querySelector('#r-hoist').checked?1:0});
      if(!r.ok){toast(r.error,'err');return;}toast('Rôle mis à jour !','ok');closeModal();
    };
  },

  async _deleteRole(rid){if(!confirm('Supprimer ce rôle ?'))return;const r=await api('role.delete','POST',{rid});if(!r.ok){toast(r.error,'err');return;}toast('Rôle supprimé');closeModal();},

  _assignRole(sid,uid,currentRoles){
    const s=S.curSrv;const roles=s.roles.filter(r=>r.name!=='@everyone');
    const cur=currentRoles.split(',').filter(Boolean);
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🎭 Gérer les rôles</div>
      <div id="role-checks">${roles.map(r=>`<label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--rs);cursor:pointer;margin-bottom:4px" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <input type="checkbox" class="rc-inp" data-id="${r.id}" ${cur.includes(r.name)?'checked':''}>
        <div style="width:12px;height:12px;border-radius:50%;background:${h(r.color||'#747f8d')}"></div>
        <span style="font-weight:600">${h(r.name)}</span>
      </label>`).join('')}</div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="role-sv">💾 Enregistrer</button></div>
    </div>`);
    md.querySelector('#role-sv').onclick=async()=>{
      const checked=[...md.querySelectorAll('.rc-inp:checked')].map(cb=>cb.dataset.id);
      const unchecked=[...md.querySelectorAll('.rc-inp:not(:checked)')].map(cb=>cb.dataset.id);
      for(const rid of checked){await api('role.assign','POST',{rid,uid});}
      for(const rid of unchecked){await api('role.revoke','POST',{rid,uid});}
      toast('Rôles mis à jour !','ok');closeModal();const rr=await api('srv.get&sid='+sid);if(rr.ok){S.curSrv=rr.data;W.renderMemList();}
    };
  },

  _nickModal(sid,uid,currentNick,username){
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">✏️ Pseudo de ${h(username)}</div>
      <div class="fg"><label class="fl">Pseudo (vide pour réinitialiser)</label><input class="fi" id="nick-inp" value="${h(currentNick)}" maxlength="32" placeholder="${h(username)}"></div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="nick-sv">Enregistrer</button></div>
    </div>`);
    md.querySelector('#nick-sv').onclick=async()=>{
      const r=await api('mod.nick','POST',{sid,uid,nick:md.querySelector('#nick-inp').value.trim()});
      if(!r.ok){toast(r.error,'err');return;}toast('Pseudo mis à jour !','ok');closeModal();
      const rr=await api('srv.get&sid='+sid);if(rr.ok){S.curSrv=rr.data;W.renderMemList();}
    };
  },

  async _modMember(sid,uid,action){const r=await api('member.mod','POST',{sid,uid,action});if(!r.ok){toast(r.error,'err');return;}toast('Fait !','ok');},
  async _kickMember(sid,uid,username){if(!confirm(`Kick ${username} ?`))return;const r=await api('member.kick','POST',{sid,uid});if(!r.ok){toast(r.error,'err');return;}toast(`${username} a été kick`,'ok');const rr=await api('srv.get&sid='+sid);if(rr.ok){S.curSrv=rr.data;W.renderMemList();}},
  async _banMember(sid,uid,username){const reason=prompt(`Raison du ban de ${username} (optionnel) :`);if(reason===null)return;const r=await api('member.ban','POST',{sid,uid,reason});if(!r.ok){toast(r.error,'err');return;}toast(`${username} a été banni`,'ok');const rr=await api('srv.get&sid='+sid);if(rr.ok){S.curSrv=rr.data;W.renderMemList();}},
  async _unban(sid,uid){const r=await api('member.unban','POST',{sid,uid});if(!r.ok){toast(r.error,'err');return;}toast('Débanni !','ok');},
  async _delWebhook(wid){if(!confirm('Supprimer ce webhook ?'))return;const r=await api('webhook.delete','POST',{wid});if(!r.ok){toast(r.error,'err');return;}toast('Webhook supprimé');},

  // ── Channels ───────────────────────────────────────────────────────────────
  createChannel(sid,catId){
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">➕ Créer un salon</div>
      <form id="cc-f">
        <div class="fg"><label class="fl">Nom *</label><input class="fi" id="cc-nm" placeholder="nouveau-salon" maxlength="100" required oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')"></div>
        <div class="fg"><label class="fl">Sujet</label><input class="fi" id="cc-tp" placeholder="À propos de ce salon..." maxlength="500"></div>
        <div class="fg"><label class="fl">Type</label>
          <select class="fi" id="cc-type">
            <option value="text">💬 Texte</option>
            <option value="voice">🔊 Vocal</option>
            <option value="announcement">📢 Annonces</option>
            <option value="forum">🗂️ Forum</option>
          </select>
        </div>
        <div class="mft"><button type="button" class="btn btn-g" onclick="closeModal()">Annuler</button><button type="submit" class="btn btn-p">Créer</button></div>
      </form>
    </div>`);
    md.querySelector('#cc-f').onsubmit=async e=>{
      e.preventDefault();
      const r=await api('ch.create','POST',{sid,cat_id:catId,name:md.querySelector('#cc-nm').value.trim(),topic:md.querySelector('#cc-tp').value.trim(),type:md.querySelector('#cc-type').value});
      if(!r.ok){toast(r.error,'err');return;}toast('Salon créé !','ok');closeModal();
      const rr=await api('srv.get&sid='+sid);if(rr.ok){S.curSrv=rr.data;W.renderChanSB();}
    };
  },

  editChannel(cid){
    const s=S.curSrv;const ch=s.categories.flatMap(c=>c.channels).find(c=>c.id===cid);if(!ch)return;
    const COLS=['#4F6BF4','#6BCB77','#FF6B6B','#FFD93D','#C77DFF','#43B8E6','#F4A261'];
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">✏️ Modifier #${h(ch.name)}</div>
      <form id="ec-f">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="fg"><label class="fl">Nom</label><input class="fi" id="ec-nm" value="${h(ch.name)}" maxlength="100"></div>
          <div class="fg"><label class="fl">Emoji</label><input class="fi" id="ec-em" value="${h(ch.emoji||'')}" maxlength="4" style="font-size:20px;text-align:center" placeholder="💬"></div>
        </div>
        <div class="fg"><label class="fl">Sujet</label><input class="fi" id="ec-tp" value="${h(ch.topic||'')}" maxlength="500" placeholder="De quoi parle ce salon ?"></div>
        <div class="fg"><label class="fl">Couleur</label><div class="c-row"><input type="color" class="fi-color" id="ec-col" value="${h(ch.color||'#4F6BF4')}"><div class="c-dots" id="ec-cdots">${COLS.map(c=>`<div class="cdot" data-c="${c}" style="background:${c}"></div>`).join('')}<div class="cdot" data-c="" style="background:var(--bg3);border:2px solid var(--bd)">⊘</div></div></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="fg"><label class="fl">Type</label>
            <select class="fi" id="ec-type"><option value="text" ${ch.type==='text'?'selected':''}>💬 Texte</option><option value="voice" ${ch.type==='voice'?'selected':''}>🔊 Vocal</option><option value="announcement" ${ch.type==='announcement'?'selected':''}>📢 Annonces</option><option value="forum" ${ch.type==='forum'?'selected':''}>🗂️ Forum</option></select>
          </div>
          <div class="fg"><label class="fl">Catégorie</label>
            <select class="fi" id="ec-cat"><option value="">— Sans catégorie —</option>${s.categories.map(cat=>`<option value="${cat.id}" ${cat.id==ch.category_id?'selected':''}>${h(cat.name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="fg"><label class="fl">Slowmode</label>
          <select class="fi" id="ec-slow">${[0,5,10,30,60,300,600,3600].map(v=>`<option value="${v}" ${ch.slowmode==v?'selected':''}>${v===0?'Désactivé':v<60?v+'s':v<3600?(v/60)+'min':(v/3600)+'h'}</option>`).join('')}</select>
        </div>
        <div style="display:flex;gap:20px;margin-bottom:16px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="ec-nsfw" ${ch.nsfw?'checked':''} style="accent-color:var(--rd)"> 🔞 NSFW</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" id="ec-lock" ${ch.locked?'checked':''} style="accent-color:var(--ac)"> 🔒 Verrouillé</label>
        </div>
        <div class="mft"><button type="button" class="btn btn-g" onclick="W.showMentionPerms(${cid})">🔔 Permissions ping</button><button type="button" class="btn btn-g" onclick="closeModal()">Annuler</button><button type="submit" class="btn btn-p">💾 Enregistrer</button></div>
      </form>
    </div>`,'modal-w');
    colorDots('ec-cdots','ec-col');
    md.querySelector('#ec-f').onsubmit=async e=>{
      e.preventDefault();
      const r=await api('ch.update','POST',{cid,name:md.querySelector('#ec-nm').value.trim(),topic:md.querySelector('#ec-tp').value.trim(),emoji:md.querySelector('#ec-em').value.trim(),color:md.querySelector('#ec-col').value,type:md.querySelector('#ec-type').value,cat_id:md.querySelector('#ec-cat').value,slowmode:md.querySelector('#ec-slow').value,nsfw:md.querySelector('#ec-nsfw').checked?'1':'0',locked:md.querySelector('#ec-lock').checked?'1':'0'});
      if(!r.ok){toast(r.error,'err');return;}toast('Salon mis à jour !','ok');closeModal();
      const rr=await api('srv.get&sid='+s.id);if(rr.ok){S.curSrv=rr.data;W.renderChanSB();}
    };
  },

  async deleteChan(cid){
    if(!confirm('Supprimer ce salon définitivement ?'))return;
    const r=await api('ch.delete','POST',{cid});if(!r.ok){toast(r.error,'err');return;}
    toast('Salon supprimé');
    if(S.curSrv){const rr=await api('srv.get&sid='+S.curSrv.id);if(rr.ok){S.curSrv=rr.data;W.renderChanSB();}}
    if(S.curCh?.id===cid){S.curCh=null;document.getElementById('msgs').innerHTML='';document.getElementById('inp-area').classList.add('hid');}
  },

  createCategory(sid){
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">📁 Créer une catégorie</div>
      <div class="fg"><label class="fl">Nom *</label><input class="fi" id="ccat-nm" placeholder="NOUVELLE CATÉGORIE" maxlength="100" required style="text-transform:uppercase"></div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="ccat-sv">Créer</button></div>
    </div>`);
    md.querySelector('#ccat-sv').onclick=async()=>{
      const r=await api('cat.create','POST',{sid,name:md.querySelector('#ccat-nm').value.trim()});
      if(!r.ok){toast(r.error,'err');return;}toast('Catégorie créée !','ok');closeModal();
      const rr=await api('srv.get&sid='+sid);if(rr.ok){S.curSrv=rr.data;W.renderChanSB();}
    };
  },

  editCategory(cid,currentName){
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">✏️ Modifier la catégorie</div>
      <div class="fg"><label class="fl">Nom</label><input class="fi" id="ecat-nm" value="${h(currentName)}" maxlength="100" style="text-transform:uppercase"></div>
      <div class="mft"><button class="btn btn-d btn-sm" onclick="W._delCat(${cid})">🗑️ Supprimer</button><div style="flex:1"></div><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="ecat-sv">💾 Enregistrer</button></div>
    </div>`);
    md.querySelector('#ecat-sv').onclick=async()=>{
      const r=await api('cat.update','POST',{cid,name:md.querySelector('#ecat-nm').value.trim()});
      if(!r.ok){toast(r.error,'err');return;}toast('Catégorie mise à jour','ok');closeModal();
      const rr=await api('srv.get&sid='+S.curSrv?.id);if(rr.ok){S.curSrv=rr.data;W.renderChanSB();}
    };
  },

  async _delCat(cid){
    if(!confirm('Supprimer cette catégorie ?'))return;
    const r=await api('cat.delete','POST',{cid});if(!r.ok){toast(r.error,'err');return;}
    toast('Catégorie supprimée');closeModal();
    const rr=await api('srv.get&sid='+S.curSrv?.id);if(rr.ok){S.curSrv=rr.data;W.renderChanSB();}
  },

  // ── Profile ────────────────────────────────────────────────────────────────
  async showProfile(uid){
    const r=await api('user.profile&uid='+uid);if(!r.ok){toast(r.error,'err');return;}
    const u=r.data;document.querySelector('.ppop')?.remove();
    const pop=document.createElement('div');pop.className='ppop';
    pop.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2500';
    const banContent=u.banner_url?`<img src="${h(u.banner_url)}" class="pban-img" alt="">`:`<div style="position:absolute;inset:0;background:linear-gradient(135deg,${h(u.accent_color||'#4F6BF4')},${h(u.accent_color||'#4F6BF4')}88)"></div>`;
    pop.innerHTML=`<div class="pban">${banContent}
      <button onclick="this.closest('.ppop').remove()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.5);border:none;color:#fff;border-radius:50%;width:28px;height:28px;cursor:pointer">✕</button>
      <div class="pav"><img src="${h(u.avatar_url)}" alt="${h(u.username)}"></div>
    </div>
    <div class="pbody">
      <div class="pnm">${h(u.username)}<span class="pdisc">#${h(u.discriminator)}</span></div>
      ${u.pronouns?`<div class="ppr">${h(u.pronouns)}</div>`:''}
      ${u.activity?`<div style="font-size:12px;color:var(--txm);margin:4px 0">${u.activity_emoji||'🎮'} <em>${h(u.activity)}</em></div>`:''}
      <div class="pst-pill"><span style="width:8px;height:8px;border-radius:50%;background:${u.status==='online'?'#3BA55D':u.status==='idle'?'#FAA61A':u.status==='dnd'?'#ED4245':'#747F8D'};flex-shrink:0"></span>${h(stL(u.status))}${u.custom_status?` — ${h(u.custom_status)}`:''}</div>
      ${u.bio?`<div class="pbio">${h(u.bio)}</div>`:''}
      ${u.badges?.length?`<div class="pbadges">${u.badges.map(b=>`<div class="badge">${b.emoji} ${h(b.label)}</div>`).join('')}</div>`:''}
      <div class="pacts">
        ${uid!==(S.user?.id)
          ?`<button class="btn btn-p btn-sm" onclick="W.openDM(${u.id},'${h(u.username)}','${h(u.avatar_url)}');document.querySelector('.ppop').remove()">💬 Message</button>${!u.is_friend?`<button class="btn btn-o btn-sm" onclick="W.sendFriendReq(${u.id});document.querySelector('.ppop').remove()">➕ Ami</button>`:'<span style="color:var(--gr);font-size:13px;padding:0 6px">✓ Ami</span>'}`
          :`<button class="btn btn-o btn-sm" onclick="document.querySelector('.ppop').remove();W.showUserSettings()">⚙️ Mon profil</button>`
        }
      </div>
    </div>`;
    document.body.appendChild(pop);
    setTimeout(()=>document.addEventListener('click',e=>{if(!pop.contains(e.target))pop.remove();},{once:true}),50);
  },

  showUserSettings(){
    const u=S.user;
    const COLS=['#4F6BF4','#C77DFF','#6BCB77','#FF6B6B','#FFD93D','#43B8E6','#F4A261','#ED4245','#FAA61A'];
    const md=modal(`<div style="padding:0;min-height:480px;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--bd)">
        <div class="mt" style="margin:0">👤 Mon profil</div>
        <button class="btn btn-g btn-sm" onclick="closeModal()">✕ Fermer</button>
      </div>
      <div class="sett-wrap" style="flex:1;overflow:hidden">
        <div class="sett-nav">
          <div class="sett-nt">Compte</div>
          <div class="sett-ni act" data-t="profile">👤 Profil</div>
          <div class="sett-ni" data-t="account">🔐 Compte</div>
          <div class="sett-ni" data-t="appearance">🎨 Apparence</div>
          <div class="sett-ni" data-t="accessibility">♿ Accessibilité</div>
          <div class="sett-sep"></div>
          <div class="sett-ni dng" onclick="W.logout()">🚪 Déconnexion</div>
        </div>
        <div class="sett-c" id="usr-tab"></div>
      </div>
    </div>`,'modal-xl');

    const show=(tab)=>{
      md.querySelectorAll('.sett-ni[data-t]').forEach(el=>el.classList.toggle('act',el.dataset.t===tab));
      const c=document.getElementById('usr-tab');c.innerHTML='';
      if(tab==='profile'){
        c.innerHTML=`<div class="sett-s">Mon profil public</div>
          <form id="usr-pf-f">
            <div style="text-align:center;margin-bottom:20px">
              <div class="av-up" onclick="document.getElementById('usr-av-up').click()">
                <img src="${h(u.avatar)}" id="usr-av-pv">
                <div class="av-up-ov">📷</div>
                <input type="file" id="usr-av-up" accept="image/*" style="display:none" onchange="document.getElementById('usr-av-pv').src=URL.createObjectURL(this.files[0])">
              </div>
              <div style="font-size:12px;color:var(--txm)">Clique pour changer</div>
            </div>
            <div class="fg"><label class="fl">Bannière de profil</label><input type="file" class="fi" id="usr-bn-up" accept="image/*" style="padding:8px"></div>
            <div class="fg"><label class="fl">Bio (max 300 car.)</label><textarea class="fi" id="usr-bio" maxlength="300" rows="3" placeholder="Parle de toi...">${h(u.bio||'')}</textarea></div>
            <div class="fg"><label class="fl">Pronoms</label><input class="fi" id="usr-pr" value="${h(u.pronouns||'')}" maxlength="40" placeholder="ex: il/lui, elle/elles..."></div>
            <div class="fg"><label class="fl">Activité actuelle</label>
              <div style="display:flex;gap:8px">
                <input class="fi" id="usr-act-em" value="${h(u.activity_emoji||'')}" maxlength="4" style="width:60px;text-align:center;font-size:20px">
                <input class="fi" id="usr-act" value="${h(u.activity||'')}" maxlength="100" placeholder="Je joue à..." style="flex:1">
              </div>
            </div>
            <div class="fg"><label class="fl">Couleur d'accent</label>
              <div class="c-row"><input type="color" class="fi-color" id="usr-ac" value="${h(u.accent_color||'#4F6BF4')}"><div class="c-dots" id="usr-acdots">${COLS.map(c2=>`<div class="cdot" data-c="${c2}" style="background:${c2}"></div>`).join('')}</div></div>
            </div>
            <button type="submit" class="btn btn-p">💾 Enregistrer le profil</button>
          </form>`;
        colorDots('usr-acdots','usr-ac');
        c.querySelector('#usr-pf-f').onsubmit=async e=>{
          e.preventDefault();const fd=new FormData();
          fd.append('bio',c.querySelector('#usr-bio').value);fd.append('pronouns',c.querySelector('#usr-pr').value);fd.append('accent_color',c.querySelector('#usr-ac').value);
          const av=c.querySelector('#usr-av-up').files[0];if(av)fd.append('avatar',av);
          const bn=c.querySelector('#usr-bn-up').files[0];if(bn)fd.append('banner',bn);
          const r=await api('user.update','POST',fd);if(!r.ok){toast(r.error,'err');return;}
          await api('user.activity','POST',{activity:c.querySelector('#usr-act').value,emoji:c.querySelector('#usr-act-em').value});
          toast('Profil mis à jour !','ok');const rm=await api('me');if(rm.ok){S.user=rm.data;W.renderUB('user-bar');W.renderUB('dm-ub');}
        };
      }else if(tab==='account'){
        c.innerHTML=`<div class="sett-s">Statut & Compte</div>
          <form id="usr-ac-f">
            <div class="fg"><label class="fl">Statut</label>
              <select class="fi" id="usr-st">${[{v:'online',l:'🟢 En ligne'},{v:'idle',l:'🌙 Inactif'},{v:'dnd',l:'🔴 Ne pas déranger'},{v:'invisible',l:'⚫ Invisible'}].map(o=>`<option value="${o.v}" ${u.status===o.v?'selected':''}>${o.l}</option>`).join('')}</select>
            </div>
            <div class="fg"><label class="fl">Statut personnalisé</label><input class="fi" id="usr-cs" value="${h(u.custom_status||'')}" maxlength="128" placeholder="Que fais-tu en ce moment ?"></div>
            <button type="submit" class="btn btn-p" style="margin-bottom:20px">💾 Enregistrer</button>
          </form>
          <div class="divider"></div>
          <div class="sett-s">Changer le pseudo</div>
          <form id="usr-nm-f">
            <div class="fg"><label class="fl">Nouveau pseudo</label><input class="fi" id="usr-new-nm" placeholder="NouveauPseudo" maxlength="32"></div>
            <div class="fg pw-w"><label class="fl">Confirmer avec ton mot de passe</label><input type="password" class="fi" id="usr-pw-c"><button type="button" class="pw-eye" onclick="togglePw('usr-pw-c')">👁</button></div>
            <button type="submit" class="btn btn-p" style="margin-bottom:20px">Changer le pseudo</button>
          </form>
          <div class="divider"></div>
          <div class="sett-s">Changer le mot de passe</div>
          <form id="usr-pw-f">
            <div class="fg pw-w"><label class="fl">Mot de passe actuel</label><input type="password" class="fi" id="usr-cpw"><button type="button" class="pw-eye" onclick="togglePw('usr-cpw')">👁</button></div>
            <div class="fg pw-w"><label class="fl">Nouveau mot de passe</label><input type="password" class="fi" id="usr-npw"><button type="button" class="pw-eye" onclick="togglePw('usr-npw')">👁</button></div>
            <div class="fg pw-w"><label class="fl">Confirmer</label><input type="password" class="fi" id="usr-npw2"><button type="button" class="pw-eye" onclick="togglePw('usr-npw2')">👁</button></div>
            <button type="submit" class="btn btn-p">Changer le mot de passe</button>
          </form>`;
        c.querySelector('#usr-ac-f').onsubmit=async e=>{e.preventDefault();const r=await api('user.update','POST',{status:c.querySelector('#usr-st').value,custom_status:c.querySelector('#usr-cs').value});if(!r.ok){toast(r.error,'err');return;}toast('Statut mis à jour !','ok');const rm=await api('me');if(rm.ok){S.user=rm.data;W.renderUB('user-bar');W.renderUB('dm-ub');}};
        c.querySelector('#usr-nm-f').onsubmit=async e=>{e.preventDefault();const r=await api('user.update','POST',{new_username:c.querySelector('#usr-new-nm').value.trim(),pw_confirm:c.querySelector('#usr-pw-c').value});if(!r.ok){toast(r.error,'err');return;}toast('Pseudo changé !','ok');const rm=await api('me');if(rm.ok){S.user=rm.data;W.renderUB('user-bar');W.renderUB('dm-ub');}};
        c.querySelector('#usr-pw-f').onsubmit=async e=>{e.preventDefault();const r=await api('user.update','POST',{current_password:c.querySelector('#usr-cpw').value,new_password:c.querySelector('#usr-npw').value,new_password2:c.querySelector('#usr-npw2').value});if(!r.ok){toast(r.error,'err');return;}toast('Mot de passe changé !','ok');c.querySelector('#usr-pw-f').reset();};
      }else if(tab==='appearance'){
        c.innerHTML=`<div class="sett-s">Thème de couleur</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
            ${[{v:'dark',n:'Sombre',c:'#0d0e10'},{v:'darker',n:'Plus sombre',c:'#070809'},{v:'midnight',n:'Minuit',c:'#060714'},{v:'ocean',n:'Océan',c:'#071018'}].map(t=>`<label style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg3);border-radius:var(--r);cursor:pointer;border:2px solid ${u.theme===t.v?'var(--ac)':'transparent'}" id="theme-lbl-${t.v}" onclick="document.documentElement.setAttribute('data-theme','${t.v}');document.querySelectorAll('[id^=theme-lbl-]').forEach(el=>el.style.borderColor='transparent');this.style.borderColor='var(--ac)'">
              <input type="radio" name="theme-r" value="${t.v}" ${u.theme===t.v?'checked':''} style="display:none">
              <div style="width:36px;height:36px;border-radius:8px;background:${t.c};border:2px solid rgba(255,255,255,.1);flex-shrink:0"></div>
              <strong>${t.n}</strong>
            </label>`).join('')}
          </div>
          <button class="btn btn-p" id="save-theme" style="margin-bottom:20px">💾 Enregistrer le thème</button>`;
        c.querySelector('#save-theme').onclick=async()=>{const sel=c.querySelector('[name=theme-r]:checked');if(!sel)return;const r=await api('user.update','POST',{theme:sel.value});if(!r.ok){toast(r.error,'err');return;}toast('Thème enregistré !','ok');S.user.theme=sel.value;};
      }else if(tab==='accessibility'){
        c.innerHTML=`<div class="sett-s">Accessibilité & Préférences</div>
          <div class="fg">
            <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--bd)">
              <div><div style="font-weight:600">Mode compact</div><div style="font-size:12px;color:var(--txm)">Affichage plus dense des messages</div></div>
              <input type="checkbox" id="pref-compact" ${S.compact?'checked':''} style="width:18px;height:18px;accent-color:var(--ac);cursor:pointer">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--bd)">
              <div><div style="font-weight:600">Sons de notification</div><div style="font-size:12px;color:var(--txm)">Bip sonore lors des nouveaux messages</div></div>
              <input type="checkbox" id="pref-sound" ${S.soundOn?'checked':''} style="width:18px;height:18px;accent-color:var(--ac);cursor:pointer">
            </label>
          </div>
          <button class="btn btn-p" id="save-prefs" style="margin-top:16px">💾 Enregistrer</button>`;
        c.querySelector('#save-prefs').onclick=()=>{
          S.compact=c.querySelector('#pref-compact').checked;
          S.soundOn=c.querySelector('#pref-sound').checked;
          localStorage.setItem('cc_compact',S.compact?'1':'0');
          localStorage.setItem('cc_sound',S.soundOn?'1':'0');
          document.documentElement.toggleAttribute('data-compact',S.compact);
          toast('Préférences enregistrées !','ok');
        };
      }
    };
    md.querySelectorAll('.sett-ni[data-t]').forEach(el=>el.addEventListener('click',()=>show(el.dataset.t)));
    show('profile');
  },

  renderUB(id){
    const u=S.user;if(!u)return;const el=document.getElementById(id);if(!el)return;
    el.innerHTML=`<div class="ub-av" onclick="W.showProfile(${u.id})"><img src="${h(u.avatar)}" alt="${h(u.username)}"><div class="ub-st ${stC(u.status)}"></div></div>
      <div class="ub-inf"><div class="ub-nm">${h(u.username)}</div>${u.custom_status?`<div class="ub-cs">${h(u.custom_status)}</div>`:`<div class="ub-tg">#${h(u.discriminator)}</div>`}</div>
      <div class="ub-btns">
        <button class="ub-btn" title="Notifications" id="${id}-nf-btn" onclick="W.showNotifs()">🔔</button>
        <button class="ub-btn" title="Paramètres" onclick="W.showUserSettings()">⚙️</button>
        <button class="ub-btn" title="Déconnexion" onclick="W.logout()">🚪</button>
      </div>`;
  },

  async showNotifs(){
    const r=await api('notifs');if(!r.ok)return;
    const list=r.data.list;
    modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="mt" style="margin:0">🔔 Notifications${r.data.unread>0?` <span style="background:var(--rd);color:#fff;font-size:11px;padding:2px 6px;border-radius:9px">${r.data.unread}</span>`:''}</div>
        <button class="btn btn-o btn-sm" onclick="api('notifs.read','POST',{}).then(()=>closeModal())">Tout lire</button>
      </div>
      <div style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
        ${list.length?list.map(n=>`<div style="padding:10px;border-radius:var(--rs);background:${n.read?'transparent':'rgba(79,107,244,.08)'};border:1px solid ${n.read?'var(--bd)':'rgba(79,107,244,.25)'}">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--txm)">${h(n.type)}</div>
          <div style="font-size:14px;margin-top:3px">${h(n.text)}</div>
          <div style="font-size:11px;color:var(--txm);margin-top:3px">${h(n.created_at||'')}</div>
        </div>`).join(''):'<div class="empty" style="padding:32px"><div class="empty-ic">🔔</div><p class="empty-d">Aucune notification</p></div>'}
      </div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Fermer</button></div>
    </div>`);
    api('notifs.read','POST',{});
  },

  async pollNotifs(){
    const check=async()=>{const r=await api('notifs');if(r.ok&&r.data.unread>0){['user-bar-nf-btn','dm-ub-nf-btn'].forEach(id=>{const el=document.getElementById(id);if(el){el.textContent='🔔';el.style.color='var(--rd)';}});}};
    await check();setInterval(check,15000);
  },

  async logout(){await api('logout','POST',{});location.reload();},

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  _initDrag(){
    const app=document.getElementById('app');
    app.addEventListener('dragover',e=>{e.preventDefault();if(!S.curCh&&!S.curDm)return;document.getElementById('drag-overlay').classList.add('vis');});
    app.addEventListener('dragleave',e=>{if(!e.relatedTarget||!app.contains(e.relatedTarget))document.getElementById('drag-overlay').classList.remove('vis');});
    app.addEventListener('drop',e=>{
      e.preventDefault();document.getElementById('drag-overlay').classList.remove('vis');
      const file=e.dataTransfer.files[0];if(!file)return;
      S.pendingFile=file;document.getElementById('file-pn').textContent=file.name;document.getElementById('file-p').classList.add('vis');
      if(file.type.startsWith('image/')){const fpv=document.getElementById('file-pv');if(fpv){fpv.src=URL.createObjectURL(file);fpv.style.display='block';}}
      toast('Fichier prêt — Appuie sur Entrée pour envoyer','ok');
    });
  },

  // ── Clipboard paste ────────────────────────────────────────────────────────
  _initPaste(){
    document.addEventListener('paste',e=>{
      if(!S.curCh&&!S.curDm)return;
      const items=[...e.clipboardData.items];const imgItem=items.find(i=>i.type.startsWith('image/'));
      if(!imgItem)return;e.preventDefault();
      const file=imgItem.getAsFile();if(!file)return;
      S.pendingFile=file;document.getElementById('file-pn').textContent='image_collée.png';document.getElementById('file-p').classList.add('vis');
      const fpv=document.getElementById('file-pv');if(fpv){fpv.src=URL.createObjectURL(file);fpv.style.display='block';}
      toast('Image collée — Entrée pour envoyer','ok');
    });
  },

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  _initKeyboard(){
    document.addEventListener('keydown',e=>{
      const inp=document.getElementById('msg-inp');
      const inInput=document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA';
      // @mention navigation
      if(S.atMentions.length){
        if(e.key==='ArrowUp'){e.preventDefault();S.atIdx=Math.max(0,S.atIdx-1);this._renderAtList();return;}
        if(e.key==='ArrowDown'){e.preventDefault();S.atIdx=Math.min(S.atMentions.length-1,S.atIdx+1);this._renderAtList();return;}
        if(e.key==='Tab'||e.key==='Enter'){e.preventDefault();if(S.atMentions[S.atIdx])this._insertMention(S.atMentions[S.atIdx].username);return;}
        if(e.key==='Escape'){this._clearAtMention();return;}
      }
      // Global shortcuts (not in input)
      if(!inInput){
        if(e.key==='/'||e.key==='k'&&e.ctrlKey){e.preventDefault();inp.focus();return;}
        if(e.key==='Escape'){closeModal();document.querySelector('.ctx')?.remove();document.querySelector('.ppop')?.remove();return;}
      }
      // Ctrl shortcuts in input
      if(inInput&&e.ctrlKey){
        if(e.key==='b'){e.preventDefault();this._wrapText('**','**');return;}
        if(e.key==='i'){e.preventDefault();this._wrapText('*','*');return;}
        if(e.key==='u'){e.preventDefault();this._wrapText('__','__');return;}
        if(e.key==='k'&&e.shiftKey){e.preventDefault();this.showSearch();return;}
      }
      // ↑ to edit last message
      if(e.key==='ArrowUp'&&document.activeElement===inp&&inp.value===''){
        const myMsgs=S.msgs.filter(m=>m.author_id===S.user?.id);
        if(myMsgs.length){e.preventDefault();this.editMsg(myMsgs[myMsgs.length-1].id);}
      }
      // Escape to clear input / reply
      if(e.key==='Escape'&&document.activeElement===inp){
        if(S.replyTo){this.clearReply();}
        else if(S.pendingFile){this.clearFile();}
      }
    });
  },

  _wrapText(before,after){
    const ta=document.getElementById('msg-inp');const start=ta.selectionStart,end=ta.selectionEnd;
    const sel=ta.value.substring(start,end);
    ta.value=ta.value.substring(0,start)+before+sel+after+ta.value.substring(end);
    ta.selectionStart=start+before.length;ta.selectionEnd=end+before.length;ta.focus();
  },


  // ══ BOOST ═══════════════════════════════════════════════════════════════
  async toggleBoost(){
    const s=S.curSrv;if(!s)return;
    const r=await api('boost.add','POST',{sid:s.id});
    if(!r.ok){toast(r.error,'err');return;}
    toast(r.data.boosted?'🚀 Serveur boosté ! Merci !':'Boost retiré','ok');
    this._updateBoostUI(r.data.count,r.data.boosted);
  },

  async _loadBoost(sid){
    const r=await api('boost.count&sid='+sid);if(!r.ok)return;
    S._boostData={count:r.data.count,boosted:r.data.boosted,sid};
    this._updateBoostUI(r.data.count,r.data.boosted);
  },

  _updateBoostUI(count,boosted){
    const LEVELS=[{n:0,min:0,max:2},{n:1,min:2,max:7},{n:2,min:7,max:14},{n:3,min:14,max:Infinity}];
    const lvl=LEVELS.findIndex(l=>count<l.max);
    const cur=LEVELS[lvl]||LEVELS[3];const next=LEVELS[Math.min(lvl+1,3)];
    const pct=cur.n<3?Math.min(100,Math.round((count-cur.min)/(next.min-cur.min)*100)):100;
    // Update header pill
    const hdr=document.getElementById('srv-hdr');
    if(hdr){
      let pill=hdr.querySelector('.srv-boost-pill');
      if(!pill){pill=document.createElement('div');pill.className='srv-boost-pill';hdr.appendChild(pill);}
      pill.innerHTML=`🚀 ${count}`;pill.style.cursor='pointer';
      pill.onclick=(e)=>{e.stopPropagation();W.showBoostPanel();};
    }
  },

  showBoostPanel(){
    const d=S._boostData||{count:0,boosted:false};
    const LEVELS=[{n:0,perks:['Emoji animés serveur']},{n:1,perks:['Emoji animés','Icône animée serveur','100 slots audio']},{n:2,perks:['Bannière serveur','Fond invitation','150 slots audio']},{n:3,perks:['Vanity URL','Fond splash','250 slots audio','Son de connexion']}];
    const lvl=d.count<2?0:d.count<7?1:d.count<14?2:3;
    const PERKS_ALL=['😄 Emojis animés serveur','🎵 Bitrate audio amélioré','🖼️ Icône serveur animée','🎨 Bannière de serveur','🔗 URL personnalisée','🔊 Slots audio premium'];
    const nextMilestone=[2,7,14];
    const until=nextMilestone[lvl]||14;
    const modal_el=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div style="background:linear-gradient(135deg,#5865f2,#c77dff);padding:24px;margin:-24px -24px 20px;border-radius:12px 12px 0 0">
        <div style="font-size:28px">🚀</div>
        <div style="font-size:20px;font-weight:800;color:#fff;margin-top:4px">Boosts Serveur</div>
        <div style="color:rgba(255,255,255,.8);font-size:13px">${h(S.curSrv?.name||'')}</div>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:48px;font-weight:900;color:var(--ac)">${d.count}</div>
        <div style="color:var(--txm);font-size:14px">boost${d.count!==1?'s':''} actif${d.count!==1?'s':''}</div>
        <div style="margin:16px auto;max-width:280px">
          <div class="boost-bar"><div class="boost-fill" id="bbf" style="width:${lvl<3?Math.min(100,Math.round((d.count-(lvl===0?0:lvl===1?2:lvl===2?7:14))/(lvl===0?2:lvl===1?5:7)*100)):100}%"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--txm)"><span>Niveau ${lvl}</span>${lvl<3?`<span>${d.count}/${until} pour le niveau ${lvl+1}</span>`:'<span>Niveau max !</span>'}</div>
        </div>
      </div>
      <div class="sett-s">Avantages débloqués</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
        ${PERKS_ALL.slice(0,lvl+2).map(p=>`<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="color:#3ba55d">✓</span>${p}</div>`).join('')}
      </div>
      <div style="text-align:center">
        <button class="btn ${d.boosted?'btn-o':'btn-p'} btn-full" onclick="W.toggleBoost().then(()=>closeModal())" style="font-size:15px;height:42px">
          ${d.boosted?'🚀 Boosté — Cliquer pour retirer':'🚀 Booster ce serveur'}
        </button>
        <div style="font-size:11px;color:var(--txm);margin-top:8px">${d.boosted?'Tu booste ce serveur depuis quelques secondes.':'Le boost dure 30 jours.'}</div>
      </div>
    </div>`);
  },

  // ══ STICKERS ════════════════════════════════════════════════════════════
  async showStickerPicker(){
    if(!S.curCh&&!S.curDm)return;
    document.querySelector('.stk-pop')?.remove();
    const r=await api('sticker.list&sid='+(S.curSrv?.id||0));
    if(!r.ok){toast(r.error,'err');return;}
    const stickers=r.data;
    const pop=document.createElement('div');pop.className='epick stk-pop';
    pop.style.cssText='position:fixed;bottom:80px;right:120px;z-index:900;width:320px';
    pop.innerHTML=`<div style="padding:10px 12px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--txm)">Stickers</div>
      <div class="stk-grid">${stickers.length?stickers.map(s=>`<div class="stk-item" onclick="W._sendSticker(${s.id});document.querySelector('.stk-pop')?.remove()" title="${h(s.name)}"><img src="${h(s.url)}" loading="lazy"></div>`).join(''):'<div style="color:var(--txm);font-size:13px;padding:10px;grid-column:1/-1">Aucun sticker disponible</div>'}</div>
      ${S.curSrv?.is_owner||(S.curSrv?.permissions&32)?`<div style="padding:8px 10px;border-top:1px solid var(--bd)"><button class="btn btn-g btn-sm btn-full" onclick="W.manageStickerModal();document.querySelector('.stk-pop')?.remove()">⚙️ Gérer les stickers</button></div>`:''}`;
    document.body.appendChild(pop);
    setTimeout(()=>document.addEventListener('click',e=>{if(!pop.contains(e.target))pop.remove();},{once:true}),50);
  },

  async _sendSticker(stid){
    if(S.curCh){
      const r=await api('sticker.send','POST',{cid:S.curCh.id,stid});
      if(!r.ok){toast(r.error,'err');return;}
      this.appendMsg(r.data);
    }
  },

  manageStickerModal(){
    const s=S.curSrv;if(!s)return;
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🎨 Gérer les stickers</div>
      <div id="stk-list-wrap" style="max-height:280px;overflow-y:auto;margin-bottom:16px"><div style="color:var(--txm);font-size:13px">Chargement...</div></div>
      <div class="sett-s">Ajouter un sticker</div>
      <form id="stk-form">
        <div class="fg"><label class="fl">Nom *</label><input class="fi" id="stk-name" placeholder="mon_sticker" maxlength="30" required></div>
        <div class="fg"><label class="fl">Tags (séparés par des virgules)</label><input class="fi" id="stk-tags" placeholder="drôle, réaction"></div>
        <div class="fg"><label class="fl">Image (PNG/JPG/GIF, max 512KB) *</label><input type="file" class="fi" id="stk-file" accept="image/*" style="padding:8px" required></div>
        <div class="mft"><button type="button" class="btn btn-g" onclick="closeModal()">Annuler</button><button type="submit" class="btn btn-p">Ajouter</button></div>
      </form>
    </div>`);
    const loadList=async()=>{
      const r=await api('sticker.list&sid='+s.id);if(!r.ok)return;
      const wrap=md.querySelector('#stk-list-wrap');
      wrap.innerHTML=r.data.filter(st=>st.server_id==s.id).length?r.data.filter(st=>st.server_id==s.id).map(st=>`<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--rs);background:var(--bg3);margin-bottom:6px"><img src="${h(st.url)}" style="width:40px;height:40px;border-radius:6px;object-fit:cover"><div style="flex:1"><div style="font-weight:600">${h(st.name)}</div><div style="font-size:11px;color:var(--txm)">${h(st.tags||'')}</div></div><button class="btn btn-d btn-sm" onclick="W._delSticker(${s.id},${st.id})">🗑️</button></div>`).join(''):'<div style="color:var(--txm);font-size:13px;padding:8px">Aucun sticker. Ajoutez-en un !</div>';
    };
    loadList();
    md.querySelector('#stk-form').onsubmit=async e=>{
      e.preventDefault();const fd=new FormData();
      fd.append('sid',s.id);fd.append('name',md.querySelector('#stk-name').value.trim());fd.append('tags',md.querySelector('#stk-tags').value.trim());
      const f=md.querySelector('#stk-file').files[0];if(!f){toast('Image requise','err');return;}fd.append('image',f);
      const r=await api('sticker.create','POST',fd);if(!r.ok){toast(r.error,'err');return;}
      toast('Sticker ajouté !','ok');md.querySelector('#stk-form').reset();loadList();
    };
  },

  async _delSticker(sid,stid){
    if(!confirm('Supprimer ce sticker ?'))return;
    const r=await api('sticker.delete','POST',{sid,stid});if(!r.ok){toast(r.error,'err');return;}
    toast('Sticker supprimé');
  },

  // ══ CUSTOM EMOJI ════════════════════════════════════════════════════════
  async showCustomEmojiManager(){
    const s=S.curSrv;if(!s)return;
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">😄 Emojis personnalisés</div>
      <div id="cemoji-list" style="display:flex;flex-wrap:wrap;gap:8px;min-height:60px;margin-bottom:16px;padding:8px;background:var(--bg3);border-radius:var(--rs)">Chargement...</div>
      <div class="sett-s">Ajouter un emoji</div>
      <form id="cemoji-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="fg"><label class="fl">Nom (ex: monEmoji)</label><input class="fi" id="ce-name" placeholder="mon_emoji" maxlength="32" pattern="[a-z0-9_]+" required></div>
          <div class="fg"><label class="fl">Image *</label><input type="file" class="fi" id="ce-file" accept="image/*" style="padding:8px" required></div>
        </div>
        <div class="mft"><button type="button" class="btn btn-g" onclick="closeModal()">Fermer</button><button type="submit" class="btn btn-p">Ajouter</button></div>
      </form>
    </div>`,'modal-w');
    const load=async()=>{
      const r=await api('emoji.list&sid='+s.id);if(!r.ok)return;
      const el=md.querySelector('#cemoji-list');
      el.innerHTML=r.data.length?r.data.map(e=>`<div style="text-align:center;padding:6px;border-radius:6px;cursor:pointer;background:var(--bg2);width:64px" title=":${h(e.name)}:" onclick="W._insertCEmoji(':${e.name}:')"><img src="${h(e.url)}" class="cemoji big" style="width:40px;height:40px"><div style="font-size:10px;color:var(--txm);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">:${h(e.name)}:</div></div>`).join('')+'<div style="width:100%"><button class="btn btn-d btn-sm" style="margin-top:8px;font-size:11px" onclick="W._delCustomEmoji('+s.id+')">🗑️ Supprimer</button></div>'
        :'<div style="color:var(--txm);font-size:13px">Aucun emoji personnalisé.</div>';
    };
    load();
    md.querySelector('#cemoji-form').onsubmit=async e=>{
      e.preventDefault();const fd=new FormData();
      fd.append('sid',s.id);fd.append('name',md.querySelector('#ce-name').value.toLowerCase().replace(/[^a-z0-9_]/g,''));
      const f=md.querySelector('#ce-file').files[0];if(!f){toast('Image requise','err');return;}fd.append('image',f);
      const r=await api('emoji.create','POST',fd);if(!r.ok){toast(r.error,'err');return;}
      toast('Emoji :'+r.data.name+': ajouté !','ok');md.querySelector('#cemoji-form').reset();load();
    };
  },

  _insertCEmoji(code){
    const mi=document.getElementById('msg-inp');mi.value+=code+' ';mi.focus();closeModal();
  },

  async _delCustomEmoji(sid){
    const name=prompt('Nom de l\'emoji à supprimer (sans les :) :');if(!name)return;
    const r=await api('emoji.list&sid='+sid);if(!r.ok)return;
    const em=r.data.find(e=>e.name===name.toLowerCase());if(!em){toast('Emoji introuvable','err');return;}
    const r2=await api('emoji.delete','POST',{eid:em.id});if(!r2.ok){toast(r2.error,'err');return;}
    toast('Emoji supprimé');
  },

  // ══ BOOKMARKS ═══════════════════════════════════════════════════════════
  async toggleBookmark(mid){
    const r=await api('bookmark.add','POST',{mid});
    if(!r.ok){toast(r.error,'err');return;}
    toast(r.data.saved?'🔖 Message sauvegardé':'Signet retiré','ok');
    const btn=document.getElementById('bk-'+mid);
    if(btn)btn.style.color=r.data.saved?'var(--ac)':'';
  },

  async showBookmarks(){
    const r=await api('bookmark.list');if(!r.ok){toast(r.error,'err');return;}
    const items=r.data.length?r.data.map(m=>`<div class="bk-item" onclick="W._jumpToMsg(${m.id},'${m.channel_id}','${h(m.ch_name||'')}','${h(m.ch_emoji||'')}');closeModal()">
      <div class="bk-loc">${m.ch_emoji||'#'}${h(m.ch_name||'DM')} · ${h(m.fmt)}</div>
      <div style="display:flex;align-items:center;gap:8px"><img src="${h(m.avatar_url)}" style="width:24px;height:24px;border-radius:50%"><strong>${h(m.username)}</strong></div>
      <div style="font-size:13px;color:var(--txm);margin-top:4px">${m.html}</div>
      ${m.note?`<div class="bk-note">📝 ${h(m.note)}</div>`:''}
    </div>`).join(''):'<div class="empty" style="padding:32px"><div class="empty-ic">🔖</div><h3 class="empty-t">Aucun message sauvegardé</h3></div>';
    modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🔖 Messages sauvegardés</div>
      <div style="max-height:440px;overflow-y:auto">${items}</div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Fermer</button></div>
    </div>`,'modal-w');
  },

  // ══ VOICE CHANNELS ══════════════════════════════════════════════════════
  async joinVoice(cid,chName){
    const r=await api('voice.join','POST',{cid});
    if(!r.ok){toast(r.error,'err');return;}
    S.voiceCh={id:cid,name:chName};S.voiceMuted=false;S.voiceDeafened=false;
    this._showVoiceBar(chName);toast('🔊 Connecté à '+chName,'ok');
    this._pollVoice(cid);
  },

  async leaveVoice(){
    await api('voice.leave','POST',{});
    S.voiceCh=null;if(S.voicePoll)clearInterval(S.voicePoll);
    document.getElementById('voice-bar')?.classList.remove('active');
    toast('Déconnecté du vocal');
  },

  async toggleMute(){
    S.voiceMuted=!S.voiceMuted;
    await api('voice.state','POST',{muted:S.voiceMuted?1:0,deafened:S.voiceDeafened?1:0});
    const btn=document.getElementById('vbtn-mute');
    if(btn){btn.textContent=S.voiceMuted?'🔇':'🎤';btn.classList.toggle('muted',S.voiceMuted);}
    toast(S.voiceMuted?'🔇 Micro coupé':'🎤 Micro actif');
  },

  async toggleDeafen(){
    S.voiceDeafened=!S.voiceDeafened;
    await api('voice.state','POST',{muted:S.voiceMuted?1:0,deafened:S.voiceDeafened?1:0});
    const btn=document.getElementById('vbtn-deaf');
    if(btn){btn.textContent=S.voiceDeafened?'🔕':'🔊';btn.classList.toggle('deafened',S.voiceDeafened);}
    toast(S.voiceDeafened?'🔕 Son coupé':'🔊 Son actif');
  },

  _showVoiceBar(name){
    let bar=document.getElementById('voice-bar');
    if(!bar){bar=document.createElement('div');bar.id='voice-bar';bar.className='voice-bar';document.body.appendChild(bar);}
    bar.innerHTML=`<div class="voice-ch-name">🔊 ${h(name)}</div>
      <div class="voice-ctrl">
        <button class="voice-btn" id="vbtn-mute" onclick="W.toggleMute()" title="Micro">🎤</button>
        <button class="voice-btn" id="vbtn-deaf" onclick="W.toggleDeafen()" title="Son">🔊</button>
        <button class="voice-btn leave" onclick="W.leaveVoice()" title="Quitter le vocal">📴</button>
      </div>`;
    bar.classList.add('active');
  },

  _pollVoice(cid){
    if(S.voicePoll)clearInterval(S.voicePoll);
    const update=async()=>{
      const r=await api('voice.list&cid='+cid);if(!r.ok)return;
      const wrap=document.getElementById('vusers-'+cid);
      if(wrap)wrap.innerHTML=r.data.map(u=>`<div class="voice-user"><img src="${h(u.avatar_url)}"><span>${h(u.username)}</span><span class="vi">${u.muted?'🔇':''}${u.deafened?'🔕':''}</span></div>`).join('');
    };
    update();S.voicePoll=setInterval(update,5000);
  },

  // ══ DISCOVERY ═══════════════════════════════════════════════════════════
  async showDiscovery(){
    const md=modal(`<div style="padding:0;min-height:500px;display:flex;flex-direction:column">
      <div style="padding:16px 20px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:12px">
        <button class="mcls" onclick="closeModal()" style="position:static;margin:0">✕</button>
        <div class="mt" style="margin:0">🔭 Découvrir des serveurs</div>
        <input class="fi" id="disc-q" placeholder="🔍 Rechercher..." style="flex:1;max-width:300px" autocomplete="off">
      </div>
      <div style="display:flex;gap:8px;padding:12px 16px 0;flex-wrap:wrap">
        ${['🎮 Gaming','🎵 Musique','💻 Tech','🎨 Art','📚 Éducation','🌍 Social','🎯 Sport','🔞 18+'].map(t=>`<button class="disc-tag" style="cursor:pointer;padding:4px 10px;font-size:12px" onclick="W._discFilter('${t.split(' ')[1]}')">${t}</button>`).join('')}
      </div>
      <div id="disc-grid" class="disc-grid" style="overflow-y:auto;flex:1">
        <div class="loader"><div class="spinner"></div><span>Recherche...</span></div>
      </div>
    </div>`,'modal-xl');
    const load=async(q='',tag='')=>{
      const r=await api('discover&q='+encodeURIComponent(q)+(tag?'&tag='+encodeURIComponent(tag):''));
      const grid=document.getElementById('disc-grid');if(!grid)return;
      if(!r.ok){grid.innerHTML='<div style="color:var(--txm);padding:32px;text-align:center">Erreur de chargement</div>';return;}
      grid.innerHTML=r.data.length?r.data.map(s=>`<div class="disc-card" onclick="W._joinFromDisc(${s.id},'${h(s.invite_code)}',${s.already_member})">
        <div class="disc-banner" style="background:linear-gradient(135deg,${h(s.color||'#4F6BF4')},${h(s.color||'#4F6BF4')}88)">
          ${s.banner?`<img src="${h(msgAttUrl(s.banner))}" style="width:100%;height:100%;object-fit:cover;opacity:.6">`:''}
          <div class="disc-icon">${s.icon_url?`<img src="${h(s.icon_url)}">`:`<div style="background:${h(s.color||'#4F6BF4')}">${h(s.name.charAt(0))}</div>`}</div>
        </div>
        <div class="disc-body">
          <div class="disc-name">${h(s.name)}</div>
          <div class="disc-desc">${h(s.description||'Un serveur CentCord')}</div>
          <div class="disc-meta"><div class="disc-online"></div>${s.member_count} membre${s.member_count!==1?'s':''} ${s.already_member?'<span style="color:var(--gr);margin-left:auto">✓ Rejoint</span>':''}</div>
        </div>
      </div>`).join(''):'<div style="color:var(--txm);padding:48px;text-align:center;grid-column:1/-1"><div style="font-size:48px">🔭</div><div style="margin-top:8px">Aucun serveur public trouvé</div></div>';
    };
    load();
    let tmt;md.querySelector('#disc-q').addEventListener('input',e=>{clearTimeout(tmt);tmt=setTimeout(()=>load(e.target.value),350);});
    W._discFilter=tag=>load(md.querySelector('#disc-q').value,tag);
  },

  async _joinFromDisc(sid,code,already){
    if(already){toast('Tu es déjà membre !','warn');return;}
    const r=await api('invite.use','POST',{code});if(!r.ok){toast(r.error,'err');return;}
    toast('Serveur rejoint !','ok');closeModal();await this.loadServers();this.openServer(sid);
  },

  // ══ GIF PICKER ══════════════════════════════════════════════════════════
  async showGifPicker(){
    if(!S.curCh&&!S.curDm)return;
    document.querySelector('.gif-pop')?.remove();
    const r=await api('gif.trending');
    const gifs=r.ok?r.data:[];
    const pop=document.createElement('div');pop.className='epick gif-pop';
    pop.style.cssText='position:fixed;bottom:80px;right:160px;z-index:900;width:360px';
    pop.innerHTML=`<div style="padding:8px 10px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--txm)">GIFs Populaires</div>
      <div class="gif-grid">${gifs.map(g=>`<div class="gif-item" onclick="W._sendGif('${h(g.url)}','${h(g.preview)}')" title="${h(g.title)}"><img src="${h(g.preview)}" loading="lazy"></div>`).join('')}</div>`;
    document.body.appendChild(pop);
    setTimeout(()=>document.addEventListener('click',e=>{if(!pop.contains(e.target))pop.remove();},{once:true}),50);
  },

  async _sendGif(url,preview){
    document.querySelector('.gif-pop')?.remove();
    const content=url;
    if(S.curCh){
      const r=await api('msg.send','POST',{cid:S.curCh.id,content});
      if(!r.ok){toast(r.error,'err');return;}
      this.appendMsg(r.data);
    }else if(S.curDm){
      const fd=new FormData();fd.append('dmid',S.curDm.id);fd.append('content',content);
      const r=await api('dm.send','POST',fd);if(!r.ok){toast(r.error,'err');return;}
      this._appendDMMsg(r.data);
    }
  },

  // ══ THREADS ═════════════════════════════════════════════════════════════
  async openThread(tid,name){
    let panel=document.getElementById('thread-panel');
    if(!panel){
      panel=document.createElement('div');panel.id='thread-panel';panel.className='thread-panel';
      panel.innerHTML=`<div class="thread-hdr">
        <button style="background:none;border:none;cursor:pointer;color:var(--tx);font-size:18px" onclick="document.getElementById('thread-panel').classList.remove('open')">←</button>
        <span id="thread-title" style="font-weight:700;font-size:15px"></span>
      </div>
      <div id="thread-msgs" class="thread-msgs"></div>
      <div class="thread-inp">
        <textarea id="thread-inp" placeholder="Écrire dans le thread..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();W._sendThreadMsg()}"></textarea>
        <button class="btn btn-p btn-sm" onclick="W._sendThreadMsg()">→</button>
      </div>`;
      document.getElementById('app').appendChild(panel);
    }
    S.curThread=tid;
    document.getElementById('thread-title').textContent='🧵 '+name;
    panel.classList.add('open');
    const r=await api('thread.messages&tid='+tid);if(!r.ok)return;
    const area=document.getElementById('thread-msgs');area.innerHTML='';
    let lastA=null;
    r.data.forEach(m=>{area.appendChild(this._mkMsg(m,lastA!==m.author_id));lastA=m.author_id;});
    area.scrollTop=area.scrollHeight;
  },

  async _sendThreadMsg(){
    const inp=document.getElementById('thread-inp');const content=inp.value.trim();if(!content||!S.curThread)return;
    inp.value='';inp.style.height='auto';
    const r=await api('thread.send','POST',{tid:S.curThread,content});if(!r.ok){toast(r.error,'err');return;}
    const area=document.getElementById('thread-msgs');const last=area.lastElementChild;
    area.appendChild(this._mkMsg(r.data,true));area.scrollTop=area.scrollHeight;
  },

  async createThread(mid){
    const name=prompt('Nom du thread :');if(!name)return;
    const r=await api('thread.create','POST',{mid,name});if(!r.ok){toast(r.error,'err');return;}
    toast('Thread créé !','ok');this.openThread(r.data.id,r.data.name);
  },

  // ══ SERVER DISCOVERY SETTINGS ════════════════════════════════════════════
  showDiscoverySettings(){
    const s=S.curSrv;if(!s)return;
    const TAGS=['Gaming','Musique','Tech','Art','Éducation','Social','Sport','Anime','Film','Science'];
    const current=JSON.parse(s.tags||'[]');
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🔭 Paramètres de découverte</div>
      <div class="fg">
        <label style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg3);border-radius:var(--rs);cursor:pointer;margin-bottom:12px">
          <div><div style="font-weight:700">Serveur public</div><div style="font-size:12px;color:var(--txm)">Apparaît dans la découverte</div></div>
          <input type="checkbox" id="disc-pub" ${s.is_public?'checked':''} style="width:18px;height:18px;accent-color:var(--ac)">
        </label>
      </div>
      <div class="sett-s">Tags (max 5)</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${TAGS.map(t=>`<label style="cursor:pointer"><input type="checkbox" class="disc-tag-cb" value="${t}" ${current.includes(t)?'checked':''} style="display:none"><div class="disc-tag" style="padding:6px 12px;font-size:13px;cursor:pointer;border:1px solid ${current.includes(t)?'var(--ac)':'var(--bd)'};color:${current.includes(t)?'var(--ac)':'var(--txm)'}" id="dtag-${t}">${t}</div></label>`).join('')}</div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="disc-save">💾 Enregistrer</button></div>
    </div>`);
    md.querySelectorAll('.disc-tag-cb').forEach(cb=>{
      cb.addEventListener('change',()=>{
        const lbl=md.querySelector('#dtag-'+cb.value);
        if(lbl){lbl.style.borderColor=cb.checked?'var(--ac)':'var(--bd)';lbl.style.color=cb.checked?'var(--ac)':'var(--txm)';}
      });
    });
    md.querySelector('#disc-save').onclick=async()=>{
      const tags=[...md.querySelectorAll('.disc-tag-cb:checked')].map(cb=>cb.value).slice(0,5);
      const pub=md.querySelector('#disc-pub').checked?1:0;
      const r=await api('srv.tags','POST',{sid:s.id,tags:JSON.stringify(tags),public:pub});
      if(!r.ok){toast(r.error,'err');return;}toast('Paramètres de découverte enregistrés !','ok');closeModal();
    };
  },


  // ══ DM VOICE CALLS (WebRTC) ══════════════════════════════════════════════
  async startCall(dmid,username){
    if(!navigator.mediaDevices){toast('Micro non disponible','err');return;}
    try{
      S.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    }catch{toast('Accès micro refusé','err');return;}
    S.callPc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]});
    S.localStream.getTracks().forEach(t=>S.callPc.addTrack(t,S.localStream));
    S.callPc.ontrack=e=>{
      let audio=document.getElementById('call-audio');
      if(!audio){audio=document.createElement('audio');audio.id='call-audio';audio.autoplay=true;document.body.appendChild(audio);}
      audio.srcObject=e.streams[0];
    };
    S.callPc.onicecandidate=async e=>{
      if(e.candidate)await api('call.ice','POST',{dmid,candidate:JSON.stringify(e.candidate)});
    };
    const offer=await S.callPc.createOffer();
    await S.callPc.setLocalDescription(offer);
    await api('call.offer','POST',{dmid,sdp:JSON.stringify(offer)});
    S.callDmid=dmid;
    this._showCallUI(username,'calling');
    // Poll for answer
    S.callAnswerPoll=setInterval(async()=>{
      const r=await api('call.poll','POST',{dmid});
      if(!r.ok)return;
      if(r.data.status==='answered'&&r.data.answer_sdp){
        clearInterval(S.callAnswerPoll);
        await S.callPc.setRemoteDescription(JSON.parse(r.data.answer_sdp));
        this._showCallUI(username,'connected');
        this._pollIce(dmid);
      }
    },2000);
    // Timeout after 30s
    setTimeout(()=>{if(S.callPc&&S.callPc.connectionState!=='connected'){clearInterval(S.callAnswerPoll);this.endCall();toast('Appel sans réponse');}},30000);
  },

  async answerCall(dmid,sdp,username){
    if(!navigator.mediaDevices){toast('Micro non disponible','err');return;}
    try{S.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});}
    catch{toast('Accès micro refusé','err');return;}
    document.getElementById('incoming-call')?.remove();
    S.callPc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    S.localStream.getTracks().forEach(t=>S.callPc.addTrack(t,S.localStream));
    S.callPc.ontrack=e=>{
      let audio=document.getElementById('call-audio');
      if(!audio){audio=document.createElement('audio');audio.id='call-audio';audio.autoplay=true;document.body.appendChild(audio);}
      audio.srcObject=e.streams[0];
    };
    S.callPc.onicecandidate=async e=>{
      if(e.candidate)await api('call.ice','POST',{dmid,candidate:JSON.stringify(e.candidate)});
    };
    await S.callPc.setRemoteDescription(JSON.parse(sdp));
    const answer=await S.callPc.createAnswer();
    await S.callPc.setLocalDescription(answer);
    await api('call.answer','POST',{dmid,sdp:JSON.stringify(answer)});
    S.callDmid=dmid;
    this._showCallUI(username,'connected');
    this._pollIce(dmid);
  },

  _pollIce(dmid){
    S.icePoll=setInterval(async()=>{
      const r=await api('call.ice.poll&dmid='+dmid);
      if(!r.ok)return;
      for(const ic of r.data){
        try{await S.callPc.addIceCandidate(JSON.parse(ic.candidate));}catch{}
      }
    },1500);
  },

  async endCall(){
    if(S.callPc){S.callPc.close();S.callPc=null;}
    if(S.localStream){S.localStream.getTracks().forEach(t=>t.stop());S.localStream=null;}
    if(S.callAnswerPoll){clearInterval(S.callAnswerPoll);S.callAnswerPoll=null;}
    if(S.icePoll){clearInterval(S.icePoll);S.icePoll=null;}
    if(S.callDmid){await api('call.end','POST',{dmid:S.callDmid});S.callDmid=null;}
    document.getElementById('call-ui')?.remove();document.getElementById('call-audio')?.remove();
    document.getElementById('incoming-call')?.remove();
    toast('Appel terminé');
  },

  _showCallUI(username,state){
    document.getElementById('call-ui')?.remove();
    const el=document.createElement('div');el.id='call-ui';
    el.style.cssText='position:fixed;top:20px;right:20px;background:var(--bg1);border:1px solid var(--bd);border-radius:16px;padding:16px 20px;z-index:9999;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.5);min-width:200px';
    const stateLabel={calling:'📞 Appel en cours…',connected:'🟢 En communication',incoming:'📲 Appel entrant'};
    el.innerHTML=`<div style="font-weight:700;font-size:15px">${h(username)}</div>
      <div style="font-size:13px;color:var(--txm)">${stateLabel[state]||state}</div>
      <div id="call-timer" style="font-size:20px;font-weight:800;font-family:var(--mo);color:var(--ac)">0:00</div>
      <div style="display:flex;gap:8px">
        <button class="voice-btn" id="call-mute-btn" onclick="W._toggleCallMute()" title="Mute">🎤</button>
        <button class="voice-btn leave" onclick="W.endCall()" title="Raccrocher" style="padding:8px 16px">📴 Raccrocher</button>
      </div>`;
    document.body.appendChild(el);
    if(state==='connected'){
      let sec=0;S.callTimer=setInterval(()=>{sec++;const m=Math.floor(sec/60),s=sec%60;const el=document.getElementById('call-timer');if(el)el.textContent=m+':'+(s<10?'0':'')+s;},1000);
    }
  },

  _toggleCallMute(){
    if(!S.localStream)return;
    const t=S.localStream.getAudioTracks()[0];if(!t)return;
    t.enabled=!t.enabled;
    const btn=document.getElementById('call-mute-btn');
    if(btn){btn.textContent=t.enabled?'🎤':'🔇';btn.classList.toggle('muted',!t.enabled);}
  },

  async _pollIncomingCall(){
    if(!S.curDm)return;
    const r=await api('call.poll','POST',{dmid:S.curDm.id});if(!r.ok)return;
    if(r.data.status==='incoming'&&!document.getElementById('incoming-call')&&!S.callPc){
      const uid=r.data.from_id;
      const uu=await api('user.profile&uid='+uid);const uname=uu.ok?uu.data.username:'Quelqu\'un';
      const el=document.createElement('div');el.id='incoming-call';
      el.style.cssText='position:fixed;top:20px;right:20px;background:linear-gradient(135deg,var(--ac),#3ba55d);border-radius:16px;padding:18px 22px;z-index:9999;display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,.5);color:#fff;min-width:220px;animation:incoming .8s infinite alternate';
      el.innerHTML=`<div style="font-size:24px">📲</div><div style="font-weight:800;font-size:16px">${h(uname)}</div><div style="font-size:13px;opacity:.8">Appel vocal entrant…</div>
        <div style="display:flex;gap:10px">
          <button class="voice-btn" onclick="W.answerCall(${S.curDm.id},'${h(r.data.sdp?.replace(/'/g,''))}','${h(uname)}')" style="background:#3ba55d;color:#fff;padding:8px 14px">✅ Décrocher</button>
          <button class="voice-btn leave" onclick="W.endCall()" style="padding:8px 14px">❌ Refuser</button>
        </div>`;
      document.body.appendChild(el);
      SFX.notif();
    }
  },

  // ══ @MENTIONS — ROLES AND MEMBERS WITH PERMISSIONS ════════════════════════
  _parseMentions(content){
    // Parse @everyone, @role:Name, @Username
    if(!S.curSrv)return content;
    const canPingEveryone=S.curSrv.is_owner||(S.curSrv.permissions&8);
    let c=content;
    // @everyone → ping all (if permission)
    if(canPingEveryone){c=c.replace(/@everyone/g,'<span class="ping-all">@everyone</span>');}
    else{c=c.replace(/@everyone/g,'<span class="ping-no">@everyone</span>');}
    // @here → online members
    c=c.replace(/@here/g,'<span class="ping-all">@here</span>');
    return c;
  },

  // In _updateAtMention: also suggest roles with @
  _updateAtMentionFull(val,pos){
    const before=val.substr(0,pos);
    const matchRole=before.match(/@(\w*)$/);
    if(!matchRole||!S.curSrv){this._clearAtMention();return;}
    const q=matchRole[1].toLowerCase();
    const members=S.curSrv.members.filter(m=>(m.username.toLowerCase().startsWith(q)||m.username.toLowerCase().includes(q))).slice(0,4);
    const roles=q.length===0?[]:(S.curSrv.roles||[]).filter(r=>r.name!=='@everyone'&&r.name.toLowerCase().startsWith(q)).slice(0,3);
    S.atMentions=[...roles.map(r=>({...r,_type:'role'})),...members.map(m=>({...m,_type:'user'}))];
    S.atIdx=0;
    if(!S.atMentions.length){this._clearAtMention();return;}
    this._renderAtListFull();
  },

  _renderAtListFull(){
    let pop=document.getElementById('at-pop');
    if(!pop){pop=document.createElement('div');pop.id='at-pop';pop.className='at-pop';document.getElementById('inp-area').appendChild(pop);}
    pop.innerHTML='';
    S.atMentions.forEach((m,i)=>{
      const el=document.createElement('div');el.className='at-item'+(i===S.atIdx?' sel':'');
      if(m._type==='role'){
        el.innerHTML=`<div style="width:24px;height:24px;border-radius:50%;background:${h(m.color||'#747f8d')};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px">@</div><span style="font-weight:700;color:${h(m.color||'var(--tx)')}">${h(m.name)}</span><span style="color:var(--txm);font-size:11px;margin-left:auto">Rôle</span>`;
        el.onclick=()=>this._insertMentionFull('@'+m.name,true);
      }else{
        el.innerHTML=`<img src="${h(m.avatar_url)}" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"><span style="font-weight:700">${h(m.username)}</span><span style="color:var(--txm);font-size:11px">#${h(m.discriminator)}</span>`;
        el.onclick=()=>this._insertMentionFull('@'+m.username,false);
      }
      pop.appendChild(el);
    });
  },

  _insertMentionFull(mention,isRole){
    const inp=document.getElementById('msg-inp');const val=inp.value;const pos=inp.selectionStart;
    const before=val.substr(0,pos);const after=val.substr(pos);
    const newBefore=before.replace(/@\w*$/,mention+' ');
    inp.value=newBefore+after;inp.selectionStart=inp.selectionEnd=newBefore.length;
    this._clearAtMention();inp.focus();
  },

  // Channel mention permissions modal
  showMentionPerms(cid){
    const ch=S.curSrv?.categories.flatMap(c=>c.channels).find(c=>c.id===cid);if(!ch)return;
    const md=modal(`<div><button class="mcls" onclick="closeModal()">✕</button>
      <div class="mt">🔔 Permissions de ping — #${h(ch.name)}</div>
      <div class="fg">
        <label style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg3);border-radius:var(--rs);margin-bottom:8px;cursor:pointer">
          <div><div style="font-weight:700">@everyone / @here</div><div style="font-size:12px;color:var(--txm)">Permet de pinguer tout le monde</div></div>
          <input type="checkbox" id="mp-everyone" ${ch.allow_everyone?'checked':''} style="width:18px;height:18px;accent-color:var(--ac)">
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg3);border-radius:var(--rs);cursor:pointer">
          <div><div style="font-weight:700">@rôles mentionnables</div><div style="font-size:12px;color:var(--txm)">Permet de pinguer les rôles configurés comme mentionnables</div></div>
          <input type="checkbox" id="mp-roles" ${ch.allow_role_ping!==0?'checked':''} style="width:18px;height:18px;accent-color:var(--ac)">
        </label>
      </div>
      <div class="mft"><button class="btn btn-g" onclick="closeModal()">Annuler</button><button class="btn btn-p" id="mp-save">💾 Enregistrer</button></div>
    </div>`);
    md.querySelector('#mp-save').onclick=async()=>{
      const r=await api('ch.mention_perms','POST',{cid,allow_everyone:md.querySelector('#mp-everyone').checked?1:0,allow_role_ping:md.querySelector('#mp-roles').checked?1:0});
      if(!r.ok){toast(r.error,'err');return;}toast('Permissions mises à jour !','ok');closeModal();
    };
  },

  // ══ AES-256-GCM E2E ENCRYPTION (Web Crypto API + ECDH) ════════════════════
  async _initCrypto(){
    // Generate or load ECDH key pair
    const stored=localStorage.getItem('cc_priv_'+S.user.id);
    if(stored){
      try{
        const raw=JSON.parse(stored);
        S.ecdhPriv=await crypto.subtle.importKey('jwk',raw.priv,{name:'ECDH',namedCurve:'P-256'},false,['deriveKey','deriveBits']);
        S.ecdhPub=await crypto.subtle.importKey('jwk',raw.pub,{name:'ECDH',namedCurve:'P-256'},true,[]);
        S.ecdhPubJwk=raw.pub;
        console.log('[E2E] Clés chargées depuis le localStorage');
        return;
      }catch{localStorage.removeItem('cc_priv_'+S.user.id);}
    }
    // Generate new key pair
    const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey','deriveBits']);
    S.ecdhPriv=kp.privateKey;S.ecdhPub=kp.publicKey;
    S.ecdhPubJwk=await crypto.subtle.exportKey('jwk',kp.publicKey);
    localStorage.setItem('cc_priv_'+S.user.id,JSON.stringify({
      priv:await crypto.subtle.exportKey('jwk',kp.privateKey),
      pub:S.ecdhPubJwk
    }));
    // Publish public key to server
    await api('key.publish','POST',{pubkey:JSON.stringify(S.ecdhPubJwk)});
    console.log('[E2E] Nouvelles clés générées et publiées');
  },

  async _getDMKey(otherUid){
    // Get other user's public key, derive shared AES-256-GCM key via ECDH
    const cacheKey='dm_key_'+otherUid;
    if(S._dmKeys&&S._dmKeys[cacheKey])return S._dmKeys[cacheKey];
    const r=await api('key.get&uid='+otherUid);
    if(!r.ok||!r.data.pubkey){
      console.warn('[E2E] Clé publique introuvable pour',otherUid,'— envoi non chiffré');
      return null;
    }
    const theirPubJwk=JSON.parse(r.data.pubkey);
    const theirPub=await crypto.subtle.importKey('jwk',theirPubJwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const sharedKey=await crypto.subtle.deriveKey(
      {name:'ECDH',public:theirPub},
      S.ecdhPriv,
      {name:'AES-GCM',length:256},
      false,
      ['encrypt','decrypt']
    );
    if(!S._dmKeys)S._dmKeys={};
    S._dmKeys[cacheKey]=sharedKey;
    return sharedKey;
  },

  async encryptMsg(content,otherUid){
    if(!S.ecdhPriv)return{ct:content,encrypted:false};
    const key=await this._getDMKey(otherUid);
    if(!key)return{ct:content,encrypted:false};
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const enc=new TextEncoder();
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(content));
    const b64=s=>btoa(String.fromCharCode(...new Uint8Array(s)));
    return{ct:'🔐'+b64(iv.buffer)+'.'+b64(ct),encrypted:true};
  },

  async decryptMsg(ciphertext,otherUid){
    if(!ciphertext.startsWith('🔐'))return ciphertext;
    if(!S.ecdhPriv)return'[🔒 Chiffré — clé non disponible]';
    try{
      const key=await this._getDMKey(otherUid);if(!key)return'[🔒 Chiffré — clé introuvable]';
      const parts=ciphertext.slice(2).split('.');
      const b2a=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
      const iv=b2a(parts[0]);const ct=b2a(parts[1]);
      const dec=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
      return new TextDecoder().decode(dec);
    }catch{return'[🔒 Déchiffrement impossible]';}
  },

  async _decryptDMMsgs(msgs,otherUid){
    return Promise.all(msgs.map(async m=>{
      if(m.content.startsWith('🔐')){
        m.content=await this.decryptMsg(m.content,otherUid);
        m.html=m.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        m._encrypted=true;
      }
      return m;
    }));
  },


  _startCallFromHeader(){
    if(!S.curDm){toast('Ouvre un DM pour appeler','warn');return;}
    const username=S._dmCallUsername||document.getElementById('chhnm').textContent;
    this.startCall(S.curDm.id,username);
  },

  _initSwipe(){
    // Touch swipe gestures
    let startX=0,startY=0;
    const app=document.getElementById('app');
    app.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
    app.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-startX;
      const dy=e.changedTouches[0].clientY-startY;
      if(Math.abs(dx)<Math.abs(dy)*0.5)return; // vertical swipe — ignore
      if(Math.abs(dx)<40)return; // too small
      const csb=document.getElementById('csb');
      const dm=document.getElementById('dm-sb');
      const ml=document.getElementById('mlist');
      if(dx>60){
        // Swipe right → open sidebar
        if(!csb.classList.contains('hid')&&!csb.classList.contains('open')){csb.classList.add('open');this._showMobOverlay();}
        else if(!dm.classList.contains('open')&&dm.style.display!=='none'){dm.classList.add('open');this._showMobOverlay();}
      }else if(dx<-60){
        // Swipe left → close sidebar or open members
        if(csb.classList.contains('open')||dm.classList.contains('open')){this._closeMobile();}
        else if(!ml.classList.contains('open')){ml.classList.add('open');this._showMobOverlay();}
        else{ml.classList.remove('open');this._closeMobile();}
      }
    },{passive:true});
  },

  _initViewportFix(){
    // Fix 100vh on mobile browsers with address bar
    const setVH=()=>document.documentElement.style.setProperty('--dvh',window.innerHeight*0.01+'px');
    setVH();window.addEventListener('resize',setVH,{passive:true});
    // Scroll input into view when keyboard opens
    const inp=document.getElementById('msg-inp');
    if(inp){inp.addEventListener('focus',()=>{setTimeout(()=>inp.scrollIntoView({block:'nearest',behavior:'smooth'}),300);},{passive:true});}
  },

  _fmtDS(dt){const d=new Date(dt),t=new Date();t.setHours(0,0,0,0);const y=new Date(t);y.setDate(y.getDate()-1);return d>=t?"Aujourd'hui":d>=y?"Hier":d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});},
  _closeMobile(){
    document.getElementById('csb').classList.remove('open');
    document.getElementById('dm-sb').classList.remove('open');
    document.getElementById('mlist').classList.remove('open');
    document.getElementById('mob-overlay')?.classList.remove('vis');
  },
  _closeAllMobile(){this._closeMobile();},
  _showMobOverlay(){document.getElementById('mob-overlay')?.classList.add('vis');},
};

// ── Events ────────────────────────────────────────────────────────────────────
document.getElementById('msg-inp').onkeydown=function(e){
  if(e.key==='Enter'&&!e.shiftKey&&!S.atMentions.length){e.preventDefault();W.send();}
};
document.getElementById('msg-inp').oninput=function(e){
  e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,280)+'px';
  const len=e.target.value.length;const cc=document.getElementById('char-c');
  if(len>3500){cc.textContent=len+'/4000';cc.className='char-c'+(len>3800?' warn':'')+(len>3950?' lim':'');}else cc.textContent='';
  W.onTyping();
  W._updateAtMentionFull(e.target.value,e.target.selectionStart);
};

document.getElementById('srv-hdr').onclick=function(e){W.showServerCtx(e);};
document.getElementById('srv-hdr').oncontextmenu=function(e){W.showServerCtx(e);};
document.getElementById('ch-mob-btn').onclick=function(){
  const csb=document.getElementById('csb');const dm=document.getElementById('dm-sb');
  if(!csb.classList.contains('hid')){csb.classList.toggle('open');W._showMobOverlay();}
  else{dm.classList.toggle('open');W._showMobOverlay();}
};
document.getElementById('dm-mob-btn').onclick=function(){
  document.getElementById('dm-sb').classList.toggle('open');W._showMobOverlay();
};
document.getElementById('hdr-mem').onclick=function(){W.toggleMembers();};

// ── Boot ──────────────────────────────────────────────────────────────────────
(async()=>{
  const r=await api('me');
  if(r.ok){document.getElementById('auth-page').classList.add('hid');document.getElementById('app').classList.remove('hid');await W.boot();}
  const inv=new URLSearchParams(location.search).get('invite');
  if(inv&&r.ok){const jr=await api('invite.use','POST',{code:inv.toUpperCase()});if(jr.ok){await W.loadServers();W.openServer(jr.data.id);}history.replaceState(null,'',location.pathname);}
})();

</script>
</body>
</html>