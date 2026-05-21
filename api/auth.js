// Thin wrapper to re-export functions from api.js to avoid duplication
const {
  createUser,
  authenticateUser,
  verifyToken,
  canCreateMoreProjects,
  addProjectToUser,
  getUserProjects,
  SECRET_KEY
} = require('./api');

module.exports = {
  createUser,
  authenticateUser,
  verifyToken,
  canCreateMoreProjects,
  addProjectToUser,
  getUserProjects,
  SECRET_KEY
};