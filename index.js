// 🛠️ HTTP server to avoid Render port binding error
const http = require("http");
http.createServer((req, res) => res.end("MR-SANKHI-MOD is alive")).listen(3000);

// 🌐 Main Bot Code
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.config = {
  prefix: "!",
  modRoleName: "Moderator",
  badWords: [
    // Hindi / Hinglish bad words
    "chutiya", "bsdk", "bhosdike", "mc", "bc", "madarchod", "behenchod",
    "gandu", "lund", "gand", "randi", "kutte", "kutiya", "suvar", "tatti",
    "gaand", "chod", "ch*d", "r***i",
    // English bad words
    "fuck", "shit", "bitch", "asshole", "dick", "pussy", "cunt", "slut",
    "faggot", "nigger", "nigga", "retard", "whore", "cock", "jerkoff",
    "wank", "fap", "kys", "kill yourself"
  ],
  inviteRegex: /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)/i,
  modLogChannelName: "mod-logs",
  serverLogChannelName: "server-logs",
  goodByeChannelName: "good-bye",
};

const messageMap = new Map();
const offenderMap = new Map();
const inviteCache = new Map();

// 🔄 Invite Cache setup
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} is ready!`);
  for (const [guildId, guild] of client.guilds.cache) {
    const invites = await guild.invites.fetch().catch(() => {});
    if (invites) inviteCache.set(guildId, invites);
  }
});

// 👮‍♂️ Moderator check
function isModerator(member) {
  return member.roles.cache.some(
    (r) => r.name.toLowerCase() === client.config.modRoleName.toLowerCase()
  );
}

// 🧾 Mod log
async function sendModLog(guild, embed) {
  const channel = guild.channels.cache.find(
    (c) => c.name === client.config.modLogChannelName
  );
  if (channel) channel.send({ embeds: [embed] }).catch(() => {});
}

// 📢 Server log
async function sendServerLog(guild, msg) {
  const channel = guild.channels.cache.find(
    (c) => c.name === client.config.serverLogChannelName
  );
  if (channel) channel.send(msg).catch(() => {});
}

// 📥 Invite Tracker
client.on("guildMemberAdd", async (member) => {
  const prevInvites = inviteCache.get(member.guild.id);
  const newInvites = await member.guild.invites.fetch().catch(() => {});
  if (!prevInvites || !newInvites) return;

  const usedInvite = newInvites.find(
    (inv) => (prevInvites.get(inv.code)?.uses || 0) < inv.uses
  );
  if (usedInvite) {
    sendServerLog(
      member.guild,
      `🎉 ${member.user.tag} joined using invite: \`${usedInvite.code}\` by ${usedInvite.inviter.tag}`
    );
  }

  inviteCache.set(member.guild.id, newInvites);
});

// 👋 GoodBye Log
client.on("guildMemberRemove", (member) => {
  const channel = member.guild.channels.cache.find(
    (c) => c.name === client.config.goodByeChannelName
  );
  if (channel)
    channel.send(`👋 ${member.user.tag} has left the server.`).catch(() => {});
});

// 🧠 All Commands & AutoMod in one place
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.toLowerCase();

  // ❌ AutoMod: Bad Words
  if (
    !isModerator(message.member) &&
    message.channel.permissionsFor(client.user).has("ManageMessages")
  ) {
    for (const bad of client.config.badWords) {
      if (content.includes(bad.toLowerCase())) {
        await message.delete().catch(() => {});
        await message.channel
          .send(`${message.author}, don't use bad words!`)
          .catch(() => {});
        await sendModLog(
          message.guild,
          new EmbedBuilder()
            .setTitle("Bad Word Deleted")
            .setDescription(`${message.author.tag} used banned word.`)
            .setColor("Red")
            .setTimestamp()
        );
        return;
      }
    }
  }

  // ❌ AutoMod: Discord Links
  if (client.config.inviteRegex.test(message.content)) {
    await message.delete().catch(() => {});
    await message.channel
      .send(`${message.author}, invite links are not allowed.`)
      .catch(() => {});
    await sendModLog(
      message.guild,
      new EmbedBuilder()
        .setTitle("Link Deleted")
        .setDescription(`${message.author.tag} posted invite link.`)
        .setColor("Orange")
        .setTimestamp()
    );
    return;
  }

  // ❌ AutoMod: Spam Protection
  const now = Date.now();
  const userMsgs = messageMap.get(message.author.id) || [];
  userMsgs.push(now);
  messageMap.set(
    message.author.id,
    userMsgs.filter((ts) => now - ts < 5000)
  );
  if (userMsgs.length > 5) {
    try {
      await message.member.timeout(60000, "Spamming");
      await sendServerLog(
        message.guild,
        `🚫 ${message.author.tag} auto-muted for spamming.`
      );
      offenderMap.set(
        message.author.id,
        (offenderMap.get(message.author.id) || 0) + 1
      );
    } catch (err) {}
  }

  // ⚒️ Moderator Commands
  if (!message.content.startsWith(client.config.prefix)) return;
  const args = message.content
    .slice(client.config.prefix.length)
    .trim()
    .split(/ +/g);
  const cmd = args.shift().toLowerCase();

  if (cmd === "kick") {
    if (!isModerator(message.member)) return message.reply("🚫 No permission.");
    const user = message.mentions.members.first();
    if (!user || !user.kickable) return message.reply("Can't kick this user.");
    await user.kick();
    await sendModLog(
      message.guild,
      new EmbedBuilder()
        .setTitle("Kick")
        .setDescription(`${user.user.tag} was kicked by ${message.author.tag}`)
        .setColor("Yellow")
        .setTimestamp()
    );
    message.channel.send(`${user.user.tag} kicked.`);
  }

  if (cmd === "ban") {
    if (!isModerator(message.member)) return message.reply("🚫 No permission.");
    const user = message.mentions.members.first();
    if (!user || !user.bannable) return message.reply("Can't ban this user.");
    await user.ban({ reason: `Banned by ${message.author.tag}` });
    await sendModLog(
      message.guild,
      new EmbedBuilder()
        .setTitle("Ban")
        .setDescription(`${user.user.tag} was banned by ${message.author.tag}`)
        .setColor("DarkRed")
        .setTimestamp()
    );
    message.channel.send(`${user.user.tag} banned.`);
  }

  if (cmd === "slowmode") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return message.reply("🚫 No permission.");
    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600)
      return message.reply("Time must be between 0-21600.");
    await message.channel.setRateLimitPerUser(seconds);
    message.channel.send(`✅ Slowmode set to ${seconds} sec.`);
  }
});

// ✅ Auto Role on Join
client.on("guildMemberAdd", async (member) => {
  const role = member.guild.roles.cache.find((r) => r.name === "Member");
  if (role) await member.roles.add(role);
});

client.login(process.env.TOKEN);
