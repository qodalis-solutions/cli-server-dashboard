import { defineMessages } from '../locales';

/** Audit page: the users plugin's audit log. */
export default defineMessages({
  en: {
    subtitle: 'Who did what, and when',
    loading: 'Loading the audit log…',
    error: 'Error: {message}',
    time: 'Time',
    event: 'Event',
    actor: 'By',
    subject: 'About',
    details: 'Details',
    address: 'Address',
    filterEvent: 'Event',
    filterActor: 'By (user)',
    filterUser: 'About (user)',
    apply: 'Filter',
    clearFilters: 'Clear',
    empty: 'No entries.',
    previous: 'Previous',
    next: 'Next',
    page: 'Page {page}',
  },
  es: {
    subtitle: 'Quién hizo qué y cuándo', loading: 'Cargando el registro de auditoría…', error: 'Error: {message}',
    time: 'Hora', event: 'Evento', actor: 'Por', subject: 'Sobre', details: 'Detalles', address: 'Dirección',
    filterEvent: 'Evento', filterActor: 'Por (usuario)', filterUser: 'Sobre (usuario)', apply: 'Filtrar',
    clearFilters: 'Borrar', empty: 'No hay entradas.', previous: 'Anterior', next: 'Siguiente', page: 'Página {page}',
  },
  fr: {
    subtitle: 'Qui a fait quoi, et quand', loading: 'Chargement du journal d’audit…', error: 'Erreur : {message}',
    time: 'Heure', event: 'Événement', actor: 'Par', subject: 'Concerne', details: 'Détails', address: 'Adresse',
    filterEvent: 'Événement', filterActor: 'Par (utilisateur)', filterUser: 'Concerne (utilisateur)', apply: 'Filtrer',
    clearFilters: 'Effacer', empty: 'Aucune entrée.', previous: 'Précédent', next: 'Suivant', page: 'Page {page}',
  },
  de: {
    subtitle: 'Wer hat was wann getan', loading: 'Audit-Protokoll wird geladen…', error: 'Fehler: {message}',
    time: 'Zeit', event: 'Ereignis', actor: 'Von', subject: 'Betrifft', details: 'Details', address: 'Adresse',
    filterEvent: 'Ereignis', filterActor: 'Von (Benutzer)', filterUser: 'Betrifft (Benutzer)', apply: 'Filtern',
    clearFilters: 'Zurücksetzen', empty: 'Keine Einträge.', previous: 'Zurück', next: 'Weiter', page: 'Seite {page}',
  },
  pt: {
    subtitle: 'Quem fez o quê e quando', loading: 'Carregando o log de auditoria…', error: 'Erro: {message}',
    time: 'Hora', event: 'Evento', actor: 'Por', subject: 'Sobre', details: 'Detalhes', address: 'Endereço',
    filterEvent: 'Evento', filterActor: 'Por (usuário)', filterUser: 'Sobre (usuário)', apply: 'Filtrar',
    clearFilters: 'Limpar', empty: 'Nenhuma entrada.', previous: 'Anterior', next: 'Próxima', page: 'Página {page}',
  },
  it: {
    subtitle: 'Chi ha fatto cosa, e quando', loading: 'Caricamento del registro di audit…', error: 'Errore: {message}',
    time: 'Ora', event: 'Evento', actor: 'Da', subject: 'Riguarda', details: 'Dettagli', address: 'Indirizzo',
    filterEvent: 'Evento', filterActor: 'Da (utente)', filterUser: 'Riguarda (utente)', apply: 'Filtra',
    clearFilters: 'Cancella', empty: 'Nessuna voce.', previous: 'Precedente', next: 'Successiva', page: 'Pagina {page}',
  },
  ja: {
    subtitle: '誰が、いつ、何をしたか', loading: '監査ログを読み込み中…', error: 'エラー: {message}',
    time: '日時', event: 'イベント', actor: '実行者', subject: '対象', details: '詳細', address: 'アドレス',
    filterEvent: 'イベント', filterActor: '実行者（ユーザー）', filterUser: '対象（ユーザー）', apply: '絞り込む',
    clearFilters: 'クリア', empty: 'エントリはありません。', previous: '前へ', next: '次へ', page: '{page} ページ',
  },
  ko: {
    subtitle: '누가 언제 무엇을 했는지', loading: '감사 로그를 불러오는 중…', error: '오류: {message}',
    time: '시간', event: '이벤트', actor: '수행자', subject: '대상', details: '세부 정보', address: '주소',
    filterEvent: '이벤트', filterActor: '수행자(사용자)', filterUser: '대상(사용자)', apply: '필터',
    clearFilters: '지우기', empty: '항목이 없습니다.', previous: '이전', next: '다음', page: '{page}페이지',
  },
  zh: {
    subtitle: '谁在何时做了什么', loading: '正在加载审计日志…', error: '错误：{message}',
    time: '时间', event: '事件', actor: '操作者', subject: '对象', details: '详情', address: '地址',
    filterEvent: '事件', filterActor: '操作者（用户）', filterUser: '对象（用户）', apply: '筛选',
    clearFilters: '清除', empty: '没有条目。', previous: '上一页', next: '下一页', page: '第 {page} 页',
  },
  ru: {
    subtitle: 'Кто, что и когда сделал', loading: 'Загрузка журнала аудита…', error: 'Ошибка: {message}',
    time: 'Время', event: 'Событие', actor: 'Кто', subject: 'Кого касается', details: 'Подробности', address: 'Адрес',
    filterEvent: 'Событие', filterActor: 'Кто (пользователь)', filterUser: 'Кого касается (пользователь)', apply: 'Фильтр',
    clearFilters: 'Сбросить', empty: 'Записей нет.', previous: 'Назад', next: 'Вперёд', page: 'Страница {page}',
  },
});
