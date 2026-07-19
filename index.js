const dgram = require("dgram");
const crypto = require("crypto");

const socket = dgram.createSocket("udp4");

const packet = Buffer.alloc(33);

let offset = 0;

// Packet ID
packet.writeUInt8(0x01, offset++);
    
// Timestamp
packet.writeBigInt64BE(BigInt(Date.now()), offset);
offset += 8;

// RakNet magic
Buffer.from([
    0x00,0xff,0xff,0x00,
    0xfe,0xfe,0xfe,0xfe,
    0xfd,0xfd,0xfd,0xfd,
    0x12,0x34,0x56,0x78
]).copy(packet, offset);
offset += 16;

// Random GUID
const guid = crypto.randomBytes(8);
guid.copy(packet, offset);

socket.send(packet, 51353, "Zenthero-Qawl.aternos.me");