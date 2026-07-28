import api from '../api';

let _audioCtx = null;
function getCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

export function playAlarmSound() {
  try {
    const ctx = getCtx();
    // Resume se suspenso (política de autoplay do navegador)
    if (ctx.state === 'suspended') ctx.resume();

    // Sequência de sino: Dó-Mi-Sol-Dó (acorde maior)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.20;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.30, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  } catch {}
}

let _timer = null;

export function startAlarmEngine(userId, onAlarm) {
  stopAlarmEngine();

  const tick = async () => {
    try {
      const r = await api.post('/reminders/check', { user_id: userId });
      const pending = r.data?.pending || [];
      if (pending.length > 0) {
        playAlarmSound();
        pending.forEach(item => onAlarm(item));
      }
    } catch {}
  };

  tick();
  _timer = setInterval(tick, 60_000);
}

export function stopAlarmEngine() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
