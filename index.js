const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const adminIds = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (!token) {
  console.error('Error: BOT_TOKEN belum diisi.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Penyimpanan sementara di memori
// Strukturnya: stats[chatId][userId] = { name, username, dailyCount, weeklyCount, notified80, notified100, blockedDm }
const stats = {};

function getChatStats(chatId) {
  if (!stats[chatId]) {
    stats[chatId] = {};
  }
  return stats[chatId];
}

function getMemberStat(chatId, user) {
  const chatStats = getChatStats(chatId);
  const userId = String(user.id);
  const displayName = user.username
    ? `@${user.username}`
    : [user.first_name, user.last_name].filter(Boolean).join(' ') || `User ${userId}`;

  if (!chatStats[userId]) {
    chatStats[userId] = {
      name: displayName,
      dailyCount: 0,
      weeklyCount: 0,
      notified80: false,
      notified100: false,
      blockedDm: false,
    };
  } else {
    chatStats[userId].name = displayName;
  }

  return chatStats[userId];
}

function isAdmin(userId) {
  return adminIds.includes(String(userId));
}

async function sendDmNotification(chatId, userId, count) {
  const member = stats[chatId]?.[String(userId)];
  try {
    await bot.sendMessage(
      userId,
      `Keren! Kamu sudah mencapai *${count} BBC* hari ini. Sedikit lagi menuju target 100 BBC di grup!`,
      { parse_mode: 'Markdown' }
    );
    if (member) {
      member.blockedDm = false;
    }
  } catch (err) {
    if (member) {
      member.blockedDm = true;
    }
  }
}

// Perintah /start untuk membuka jalur DM
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  Object.values(stats).forEach((chatStats) => {
    if (chatStats[String(userId)]) {
      chatStats[String(userId)].blockedDm = false;
    }
  });

  if (msg.chat.type === 'private') {
    await bot.sendMessage(
      chatId,
      'Halo! Bot BBC aktif. Pastikan kamu tidak memblokir bot ini supaya notifikasi target 80 BBC bisa masuk ke DM.'
    );
  }
});

// Cek statistik harian & mingguan di grup
bot.onText(/\/cekbbc/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.chat.type === 'private') return;

  const member = getMemberStat(chatId, msg.from);
  await bot.sendMessage(
    chatId,
    `Statistik *${member.name}*:\n• Hari ini: *${member.dailyCount}/100 BBC*\n• Minggu ini: *${member.weeklyCount}/560 BBC*`,
    { parse_mode: 'Markdown' }
  );
});

// Perintah khusus admin untuk melihat daftar evaluasi mingguan (< 560 BBC) & status DM
bot.onText(/\/ceklist/, async (msg) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;

  if (msg.chat.type === 'private') return;

  if (!isAdmin(senderId)) {
    await bot.sendMessage(chatId, 'Perintah ini khusus untuk admin.');
    return;
  }

  const chatStats = getChatStats(chatId);
  const entries = Object.values(chatStats);

  if (entries.length === 0) {
    await bot.sendMessage(chatId, 'Belum ada data BBC yang tercatat di grup ini.');
    return;
  }

  const belowWeeklyTarget = entries.filter((m) => m.weeklyCount < 560);
  const blockedUsers = entries.filter((m) => m.blockedDm);

  let text = '*Daftar Evaluasi Mingguan (< 560 BBC):*\n';
  if (belowWeeklyTarget.length === 0) {
    text +=
