/**
 * Byla — Sync automático do FLUXO DE CAIXA (só inserir).
 *
 * Quando a planilha é editada, espera ~4 minutos sem novas edições (debounce)
 * e chama o backend: POST /api/sync/fluxo-so-inserir.
 * O backend SÓ INSERE alunos/pagamentos novos. Se houver conflito, não grava nada.
 *
 * Configuração (uma vez): ver docs/SYNC_AUTO_PLANILHA.md
 *   Script Properties:
 *     SYNC_URL     = https://SEU-BACKEND.onrender.com/api/sync/fluxo-so-inserir
 *     SYNC_SECRET  = (mesmo valor de SYNC_WEBHOOK_SECRET no Render)
 *   Depois rode instalarGatilhos() uma vez pelo editor.
 */

var DEBOUNCE_MS = 4 * 60 * 1000;        // espera 4 min após a última edição
var RETRY_DELAY_MS = 5 * 60 * 1000;     // nova tentativa se o Render não responder
var MAX_RETRIES = 3;                    // tentativas reagendadas
var TENTATIVAS_IMEDIATAS = 3;           // tentativas dentro da mesma execução
var HANDLER = 'executarSyncFluxo';

/** Rode UMA vez manualmente para criar os gatilhos instaláveis. */
function instalarGatilhos() {
  removerGatilhos_(['aoEditarFluxo', 'aoAlterarFluxo']);
  var ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('aoEditarFluxo').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('aoAlterarFluxo').forSpreadsheet(ss).onChange().create();
}

/** Remove todos os gatilhos deste script (rollback). */
function desinstalarGatilhos() {
  removerGatilhos_(['aoEditarFluxo', 'aoAlterarFluxo', HANDLER]);
  PropertiesService.getScriptProperties().deleteProperty('SYNC_RETRY_COUNT');
}

function aoEditarFluxo(e) { agendarSync_(); }
function aoAlterarFluxo(e) { agendarSync_(); }

/** Debounce: cada edição empurra o sync para DEBOUNCE_MS no futuro. */
function agendarSync_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('SYNC_ULTIMA_EDICAO', String(Date.now()));
    props.setProperty('SYNC_RETRY_COUNT', '0');
    removerGatilhos_([HANDLER]);
    ScriptApp.newTrigger(HANDLER).timeBased().after(DEBOUNCE_MS).create();
  } finally {
    lock.releaseLock();
  }
}

/** Chamado pelo gatilho de tempo. */
function executarSyncFluxo() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  var props = PropertiesService.getScriptProperties();
  try {
    removerGatilhos_([HANDLER]);
    // Se houve edição depois do agendamento, reagenda (debounce).
    var ultima = Number(props.getProperty('SYNC_ULTIMA_EDICAO') || 0);
    var falta = ultima + DEBOUNCE_MS - Date.now();
    if (falta > 15000) {
      ScriptApp.newTrigger(HANDLER).timeBased().after(falta).create();
      return;
    }

    var url = props.getProperty('SYNC_URL');
    var secret = props.getProperty('SYNC_SECRET');
    if (!url || !secret) {
      console.error('SYNC_URL / SYNC_SECRET não configurados nas Script Properties.');
      return;
    }

    var resp = null;
    for (var i = 0; i < TENTATIVAS_IMEDIATAS; i++) {
      try {
        resp = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'X-Sync-Webhook-Secret': secret },
          payload: JSON.stringify({ origem: 'apps-script' }),
          muteHttpExceptions: true,
        });
        var code = resp.getResponseCode();
        // 5xx/502/503 = Render acordando; 409 = outro sync rodando → tenta de novo.
        if (code < 500 && code !== 409) break;
      } catch (err) {
        console.warn('Tentativa ' + (i + 1) + ' falhou: ' + err);
        resp = null;
      }
      Utilities.sleep(20000);
    }

    var ok = resp && resp.getResponseCode() < 500 && resp.getResponseCode() !== 409;
    if (!ok) {
      var n = Number(props.getProperty('SYNC_RETRY_COUNT') || 0) + 1;
      props.setProperty('SYNC_RETRY_COUNT', String(n));
      if (n <= MAX_RETRIES) {
        ScriptApp.newTrigger(HANDLER).timeBased().after(RETRY_DELAY_MS).create();
        console.warn('Backend indisponível; nova tentativa ' + n + '/' + MAX_RETRIES + ' em 5 min.');
      } else {
        console.error('Sync desistiu após ' + MAX_RETRIES + ' tentativas. Próxima edição tenta de novo.');
      }
      return;
    }
    props.setProperty('SYNC_RETRY_COUNT', '0');
    // Resposta só tem contagens (sem nomes).
    console.log('Sync: HTTP ' + resp.getResponseCode() + ' ' + resp.getContentText().slice(0, 2000));
  } finally {
    lock.releaseLock();
  }
}

function removerGatilhos_(nomes) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (nomes.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
}
