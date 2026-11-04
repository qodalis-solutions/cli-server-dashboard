import { defineMessages } from '../locales';

/** Sign-in page. */
export default defineMessages({
  en: {
    subtitle: 'Server Administration',
    username: 'Username',
    password: 'Password',
    invalidCredentials: 'Invalid credentials',
    signingIn: 'Signing in…',
    signIn: 'Sign in',
    externalHint: 'This server uses your application’s sign-in.',
    signInAt: 'Sign in at {url}',
    signInThroughHost: 'Sign in through the host application, then retry.',
    retry: 'Retry',
    checking: 'Checking…',
    stillSignedOut: 'You are not signed in yet. Sign in, then retry.',
  },
  es: {
    subtitle: 'Administración del servidor', username: 'Usuario', password: 'Contraseña',
    invalidCredentials: 'Credenciales no válidas', signingIn: 'Iniciando sesión…', signIn: 'Iniciar sesión',
    externalHint: 'Este servidor usa el inicio de sesión de tu aplicación.', signInAt: 'Inicia sesión en {url}', signInThroughHost: 'Inicia sesión en la aplicación anfitriona y vuelve a intentarlo.', retry: 'Reintentar', checking: 'Comprobando…', stillSignedOut: 'Aún no has iniciado sesión. Inicia sesión y vuelve a intentarlo.',
  },
  fr: {
    subtitle: 'Administration du serveur', username: 'Nom d’utilisateur', password: 'Mot de passe',
    invalidCredentials: 'Identifiants invalides', signingIn: 'Connexion…', signIn: 'Se connecter',
    externalHint: 'Ce serveur utilise la connexion de votre application.', signInAt: 'Se connecter sur {url}', signInThroughHost: 'Connectez-vous dans l’application hôte, puis réessayez.', retry: 'Réessayer', checking: 'Vérification…', stillSignedOut: 'Vous n’êtes pas encore connecté. Connectez-vous, puis réessayez.',
  },
  de: {
    subtitle: 'Serververwaltung', username: 'Benutzername', password: 'Passwort',
    invalidCredentials: 'Ungültige Anmeldedaten', signingIn: 'Anmeldung läuft…', signIn: 'Anmelden',
    externalHint: 'Dieser Server verwendet die Anmeldung Ihrer Anwendung.', signInAt: 'Bei {url} anmelden', signInThroughHost: 'Melden Sie sich in der Host-Anwendung an und versuchen Sie es erneut.', retry: 'Erneut versuchen', checking: 'Wird geprüft…', stillSignedOut: 'Sie sind noch nicht angemeldet. Melden Sie sich an und versuchen Sie es erneut.',
  },
  pt: {
    subtitle: 'Administração do servidor', username: 'Usuário', password: 'Senha',
    invalidCredentials: 'Credenciais inválidas', signingIn: 'Entrando…', signIn: 'Entrar',
    externalHint: 'Este servidor usa o login do seu aplicativo.', signInAt: 'Entrar em {url}', signInThroughHost: 'Entre pelo aplicativo host e tente novamente.', retry: 'Tentar novamente', checking: 'Verificando…', stillSignedOut: 'Você ainda não entrou. Entre e tente novamente.',
  },
  it: {
    subtitle: 'Amministrazione del server', username: 'Nome utente', password: 'Password',
    invalidCredentials: 'Credenziali non valide', signingIn: 'Accesso in corso…', signIn: 'Accedi',
    externalHint: 'Questo server usa l’accesso della tua applicazione.', signInAt: 'Accedi su {url}', signInThroughHost: 'Accedi tramite l’applicazione host, poi riprova.', retry: 'Riprova', checking: 'Verifica in corso…', stillSignedOut: 'Non hai ancora effettuato l’accesso. Accedi, poi riprova.',
  },
  ja: {
    subtitle: 'サーバー管理', username: 'ユーザー名', password: 'パスワード',
    invalidCredentials: '認証情報が正しくありません', signingIn: 'サインイン中…', signIn: 'サインイン',
    externalHint: 'このサーバーはアプリケーションのサインインを使用します。', signInAt: '{url} でサインイン', signInThroughHost: 'ホストアプリケーションでサインインしてから、再試行してください。', retry: '再試行', checking: '確認中…', stillSignedOut: 'まだサインインしていません。サインインしてから再試行してください。',
  },
  ko: {
    subtitle: '서버 관리', username: '사용자 이름', password: '비밀번호',
    invalidCredentials: '자격 증명이 올바르지 않습니다', signingIn: '로그인 중…', signIn: '로그인',
    externalHint: '이 서버는 애플리케이션의 로그인을 사용합니다.', signInAt: '{url}에서 로그인', signInThroughHost: '호스트 애플리케이션에서 로그인한 후 다시 시도하세요.', retry: '다시 시도', checking: '확인 중…', stillSignedOut: '아직 로그인하지 않았습니다. 로그인한 후 다시 시도하세요.',
  },
  zh: {
    subtitle: '服务器管理', username: '用户名', password: '密码',
    invalidCredentials: '凭据无效', signingIn: '正在登录…', signIn: '登录',
    externalHint: '此服务器使用您应用程序的登录。', signInAt: '在 {url} 登录', signInThroughHost: '请通过宿主应用程序登录，然后重试。', retry: '重试', checking: '正在检查…', stillSignedOut: '您尚未登录。请登录后重试。',
  },
  ru: {
    subtitle: 'Администрирование сервера', username: 'Имя пользователя', password: 'Пароль',
    invalidCredentials: 'Неверные учётные данные', signingIn: 'Вход…', signIn: 'Войти',
    externalHint: 'Этот сервер использует вход вашего приложения.', signInAt: 'Войти на {url}', signInThroughHost: 'Войдите через основное приложение, затем повторите попытку.', retry: 'Повторить', checking: 'Проверка…', stillSignedOut: 'Вы ещё не вошли. Войдите, затем повторите попытку.',
  },
});
