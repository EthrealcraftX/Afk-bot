const { prisma } = require('./prisma');

class ServerRepository {
  /**
   * Registers or updates a server based on the ping status.
   * Only ONLINE servers are newly created. Offline only updates if already tracked.
   * Stores the original input address and type so health checks are correct.
   */
  static async upsertServer(status, parsed) {
    if (!status.host) return null;

    const host = status.host.toLowerCase();
    const port = status.port ?? (status.edition === 'java' ? 25565 : 19132);
    const edition = status.edition;

    const existing = await prisma.server.findUnique({
      where: { host_port_edition: { host, port, edition } },
    });

    if (existing) {
      return prisma.server.update({
        where: { id: existing.id },
        data: {
          status: status.online ? 'online' : 'offline',
          players: status.players ?? 0,
          maxPlayers: status.maxPlayers ?? 0,
          version: status.version,
          motd: status.motd,
          latency: status.latency ?? 0,
          lastSeen: status.online ? new Date() : existing.lastSeen,
          lastChecked: new Date(),
          timesDetected: { increment: 1 },
        },
      });
    }

    // Only create a new record if it's online
    if (status.online) {
      return prisma.server.create({
        data: {
          host,
          port,
          edition,
          status: 'online',
          // Preserve original input identity for accurate health checks
          inputAddress: parsed?.serverName ?? parsed?.host ?? host,
          originalType: parsed?.type ?? 'domain',
          players: status.players ?? 0,
          maxPlayers: status.maxPlayers ?? 0,
          version: status.version,
          motd: status.motd,
          latency: status.latency ?? 0,
          category: 'Unknown',
          timesDetected: 1,
        },
      });
    }

    return null;
  }

  static async getTopServers(limit = 5) {
    return prisma.server.findMany({
      where: { status: 'online' },
      orderBy: [
        { players: 'desc' },
        { latency: 'asc' },
      ],
      // Fetch more than needed so recommendation service can shuffle slightly
      take: limit * 3,
    });
  }

  static async incrementRecommended(id) {
    return prisma.server.update({
      where: { id },
      data: { timesRecommended: { increment: 1 } },
    });
  }

  static async getAllStoredServers() {
    return prisma.server.findMany();
  }

  static async updateHealthCheck(id, status) {
    return prisma.server.update({
      where: { id },
      data: {
        status: status.online ? 'online' : 'offline',
        players: status.players ?? 0,
        maxPlayers: status.maxPlayers ?? 0,
        version: status.version,
        motd: status.motd,
        latency: status.latency ?? 0,
        lastSeen: status.online ? new Date() : undefined,
        lastChecked: new Date(),
      },
    });
  }
}

module.exports = { ServerRepository };
