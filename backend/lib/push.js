const webpush = require('web-push');
const supabase = require('../supabase');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@rota2.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Retorna user_ids afetados pelo targetType
async function getAffectedUserIds(targetType, targetValue, requesterCompany) {
  // lider = targetValue é o user_id diretamente
  if (targetType === 'lider') return targetValue ? [targetValue] : [];

  let query = supabase.from('profiles').select('id').eq('active', true).eq('company', requesterCompany);
  if (targetType === 'setor') query = query.eq('sector', targetValue);

  const { data } = await query;
  return data ? data.map(d => d.id) : [];
}

// Envia push para lista direta de user_ids (sem filtro por empresa)
async function sendPushToUsers(userIds, payload) {
  if (!userIds?.length) return 0;
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription, endpoint')
    .in('user_id', userIds);
  if (!subs?.length) return 0;

  const results = await Promise.allSettled(
    subs.map(s => webpush.sendNotification(s.subscription, JSON.stringify(payload)))
  );
  const expired = results
    .map((r, i) => (r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i] : null))
    .filter(Boolean);
  if (expired.length) {
    await supabase.from('push_subscriptions')
      .delete()
      .in('endpoint', expired.map(s => s.endpoint || s.subscription?.endpoint));
  }
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) console.warn('Push failures:', failures.map(f => f.reason?.statusCode || f.reason?.message));
  return results.filter(r => r.status === 'fulfilled').length;
}

// Envia push para todos os usuários afetados por targetType
async function sendPushToTargets({ targetType, targetValue, company, payload }) {
  try {
    const userIds = await getAffectedUserIds(targetType, targetValue, company);
    return await sendPushToUsers(userIds, payload);
  } catch (e) {
    console.error('Push error:', e.message);
    return 0;
  }
}

module.exports = { sendPushToTargets, sendPushToUsers };
