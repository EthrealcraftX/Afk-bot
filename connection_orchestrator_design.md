# Connection Orchestrator — Architecture & Design

## 1. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         ConnectionManager                            │
│                     (Top-level orchestrator)                         │
│                                                                      │
│  ┌───────────────────────┐    ┌─────────────────────────────────┐    │
│  │  ConnectionStateMachine│    │         MetricsCollector        │    │
│  │  (FSM — all states)   │    │   (counters, timings, export)   │    │
│  └───────────┬───────────┘    └─────────────────────────────────┘    │
│              │                                                        │
│   ┌──────────▼──────────┐    ┌─────────────────────────────────┐    │
│   │  BedrockPingService  │    │           Logger                │    │
│   │  (UDP status probe)  │    │ (structured, levelled, events)  │    │
│   └──────────┬───────────┘    └─────────────────────────────────┘    │
│              │                                                        │
│   ┌──────────▼──────────┐    ┌─────────────────────────────────┐    │
│   │    RetryScheduler    │    │      ErrorClassifier            │    │
│   │  (adaptive backoff)  │    │  (retryable vs permanent)       │    │
│   └──────────┬───────────┘    └─────────────────────────────────┘    │
│              │                                                        │
│   ┌──────────▼──────────┐                                            │
│   │    JoinExecutor      │                                            │
│   │  (creates bedrock    │                                            │
│   │   client, fires AFK) │                                            │
│   └─────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. State Transition Diagram

```
           ┌──────────────────────────┐
           │          IDLE             │◄──────────────────────────────┐
           └──────────┬───────────────┘                               │
                      │ start()                                        │
                      ▼                                                │
           ┌──────────────────────────┐                               │
           │        RESOLVING          │ (optional: Aternos link       │
           └──────────┬───────────────┘  resolution, if needed)       │
                      │ resolved                                       │
                      ▼                                                │
           ┌──────────────────────────┐   ping fails                  │
           │         PINGING           ├──────────────────────────────►│
           └──────────┬───────────────┘                   WAITING     │
                      │ ping succeeds                         │        │
                      ▼                                      │        │
           ┌──────────────────────────┐                      │        │
           │         STARTING          │   (stabilization    │        │
           │   (waiting for server    │    delay before       │        │
           │    to fully boot)        │    attempting join)   │        │
           └──────────┬───────────────┘                               │
                      │ stabilization done                             │
                      ▼                                                │
           ┌──────────────────────────┐   join fails (retryable)      │
           │         JOINING           ├──────────────────────────────►│
           └──────────┬───────────────┘                               │
                      │ join succeeds                                  │
                      ▼                                                │
           ┌──────────────────────────┐   disconnect / error          │
           │        CONNECTED          ├──────────────────────────────►│
           └──────────┬───────────────┘                               │
                      │                        ┌──────────────────────┘
                      │              WAITING ◄──┘
                      │            ┌──────┤
                      │            │      │ scheduled ping retry
                      │            │      ▼
                      │            │   PINGING (loop back)
                      │            │
                      │ stop()     ▼
                      ▼       ┌──────────────────────────┐
           ┌──────────────────│        FAILED             │
           │    CANCELLED     │  (max retries exceeded /  │
           │  (user stopped)  │   permanent error)        │
           └──────────────────└──────────────────────────┘
```

## 3. Folder Structure

```
templates/bedrock/
├── index.js                        ← Entry point (thin wrapper → ConnectionManager)
├── package.json
├── username.txt
├── version.json
└── orchestrator/
    ├── ConnectionManager.js        ← Top-level lifecycle controller
    ├── ConnectionStateMachine.js   ← Explicit FSM, validates transitions
    ├── BedrockPingService.js       ← UDP ping with timeout + retry
    ├── JoinExecutor.js             ← Creates bedrock-protocol client, AFK movement
    ├── RetryScheduler.js           ← Adaptive exponential backoff + cancellation
    ├── ErrorClassifier.js          ← Classifies errors as retryable or permanent
    ├── Logger.js                   ← Structured, levelled, event-based logger
    └── MetricsCollector.js         ← Connection health metrics
```

## 4. Design Decisions

### Why a State Machine over a Simple Retry Loop

A fixed retry loop has one state: "try → wait → try again". This creates several production problems:

| Problem | Fixed Retry | State Machine |
|---------|-------------|---------------|
| Duplicate joins | Can attempt join while already joining | `JOINING` state prevents this |
| Blind reconnects | Retries even if server is permanently offline | `PINGING` validates before every join |
| Missed starts | Fixed 60s interval may miss the 10s window when Aternos boots | Adaptive ping detects readiness immediately |
| Unrecoverable errors | Keeps retrying on version mismatches | `ErrorClassifier` marks permanent → `FAILED` |
| No observability | Single counter | `MetricsCollector` tracks latency, uptime, attempts |

### Why Smart Ping Before Every Join

Bedrock UDP ping (`bedrockping`) takes ~200ms and tells us the server's MOTD and player count **without** establishing a full session. This is cheap. A failed join attempt:
1. Establishes a TCP/UDP handshake (expensive)
2. Sends login packets (expensive)
3. Times out after 20s (very expensive)

By pinging first, we spend 200ms to avoid wasting 20s.

### Why Adaptive Backoff

Aternos servers take 1–4 minutes to boot. Fixed 60s retry:
- Attempt 1 at T=0: server not ready → fail
- Attempt 2 at T=60: server ready at T=90 → fail again  
- Attempt 3 at T=120: server at T=90 → finally joins, but 30s wasted

Adaptive strategy with short initial intervals catches the exact moment the server becomes pingable, then stabilizes before joining.

### Why Dependency Injection

Each module receives its dependencies in the constructor. This enables:
- Unit tests with mock `BedrockPingService` that returns known results
- Swapping `Logger` implementation (file, Telegram, stdout)
- Injecting a test `RetryScheduler` that fires immediately

### Why Not TypeScript Compiled

The project runs directly in Node.js without a build step. All modules are plain JavaScript with JSDoc type annotations, which gives IDE autocomplete without requiring `tsc`.
