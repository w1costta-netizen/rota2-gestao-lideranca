const webpush = require('web-push');
const supabase = require('../supabase');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@rota2.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Retorna user_ids afetados pelo item de agenda
async function getAffectedUserIds(targetType, targetValue, requesterCompany) {
  if (targetType === 'lider') return []; // lider usa tabela antiga, não mapeável a profiles

  let query = supabase.from('profiles').select('id').eq('active', true).eq('company', requesterCompany);
  if (targetType === 'setor') query = query.eq('sector', targetValue);

  const { data } = await query;
  return data ? data.map(d => d.id) : [];
}

// Envia push para todos os usuários afetados
async function sendPushToTargets({ targetType, targetValue, company, payload }) {
  try {
    const userIds = await getAffectedUserIds(targetType, targetValue, company);
    if (!userIds.length) return 0;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .in('user_id', userIds);
    if (!subs?.length) return 0;

    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification(s.subscription, JSON.stringify(payload)))
    );
    // Remove subscriptions que expiraram (410 Gone)
    const expired = results
      .map((r, i) => (r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i] : null))
      .filter(Boolean);
    if (expired.length) {
      await supabase.from('push_subscriptions')
        .delete()
        .in('endpoint', expired.map(s => s.subscription.endpoint));
    }
    return results.filter(r => r.status === 'fulfilled').length;
  } catch (e) {
    console.error('Push error:', e.message);
    return 0;
  }
}

module.exports = { sendPushToTargets };
