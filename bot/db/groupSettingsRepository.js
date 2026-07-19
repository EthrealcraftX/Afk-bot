const { prisma } = require('./prisma');

class GroupSettingsRepository {
  static async getSettings(chatId) {
    let settings = await prisma.groupSettings.findUnique({
      where: { chatId }
    });

    if (!settings) {
      settings = await prisma.groupSettings.create({
        data: { chatId }
      });
    }

    return settings;
  }

  static async updateSettings(chatId, data) {
    return prisma.groupSettings.upsert({
      where: { chatId },
      update: data,
      create: {
        chatId,
        ...data
      }
    });
  }
}

module.exports = { GroupSettingsRepository };
