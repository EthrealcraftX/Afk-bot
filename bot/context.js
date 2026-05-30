let botInstance = null;

module.exports = {
  get bot() { return botInstance; },
  set bot(val) { botInstance = val; }
};
