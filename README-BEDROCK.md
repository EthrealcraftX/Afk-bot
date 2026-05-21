Bedrock native binding (raknet-native) troubleshooting

Why you get "Could not locate the bindings file":
- The `raknet-native` module includes a compiled binary. If your Node.js version or platform lacks a prebuilt binary, Node will try to load a compiled .node file and fail if missing.

Quick fixes (ordered):
1) Install deps and try rebuild
   - npm install
   - npm run rebuild-raknet
   - If rebuild fails: npm i raknet-native --build-from-source

2) Install build tools (WSL/Ubuntu)
   - sudo apt update && sudo apt install -y build-essential python3 python3-dev pkg-config libssl-dev
   - Then re-run rebuild commands.

3) Node version mismatch
   - Switch to Node LTS (v18 or v20) using nvm:
     - curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
     - nvm install --lts
     - nvm use --lts
     - rm -rf node_modules package-lock.json
     - npm install
     - npm run rebuild-raknet

4) Health & admin rebuild
   - GET /api/health shows raknet.installed (true/false) and error message if missing.
   - Admin users can trigger rebuild from UI (if you set ADMIN_USERS env var with comma-separated usernames) or via POST /api/admin/rebuild-raknet.

Environment vars:
- JWT_SECRET (required)
- ADMIN_USERS (comma separated list, e.g., ADMIN_USERS=admin,MultiMax)

If you'd like, I can add platform-specific scripts for Windows or automate Node version detection. Send me the output of `npm run rebuild-raknet` if rebuild still fails and I'll analyze the error output for you.