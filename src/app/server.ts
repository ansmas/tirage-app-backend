import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://delux-salmiakki-e0a160.netlify.app",
    ],
    credentials: true,
  })
);


/* =======================
   Types
======================= */

type User = {
  id: string;
  name: string;
  excludedUserIds: string[];
  ready: boolean;
};

type Session = {
  id: string;
  users: Map<string, User>;
  assignments?: Map<string, string>;
};

const sessions = new Map<string, Session>();

/* =======================
   Utils
======================= */

function shuffle<T>(array: T[]): T[] {
  return [...array].sort(() => Math.random() - 0.5);
}

function generateAssignments(users: User[]): Map<string, string> {
  if (users.length < 2) {
    throw new Error("Not enough users");
  }

  const userIds = users.map(u => u.id);

  let shuffledIds: string[] = [];
  let attempts = 0;

  while (attempts < 1000) {
    attempts++;
    shuffledIds = shuffle(userIds);

    let valid = true;

    for (let i = 0; i < users.length; i++) {
      const user = users[i]!;           // ← on garantit ici
      const assignedId = shuffledIds[i];

      if (
        !assignedId ||
        assignedId === user.id ||
        user.excludedUserIds.includes(assignedId)
      ) {
        valid = false;
        break;
      }
    }

    if (valid) break;
  }

  if (attempts >= 1000) {
    throw new Error("Impossible to generate valid assignments");
  }

  const result = new Map<string, string>();

  for (let i = 0; i < users.length; i++) {
    const user = users[i]!;             // ← et ici
    const assignedId = shuffledIds[i]!;

    result.set(user.id, assignedId);
  }

  return result;
}



/* =======================
   Routes
======================= */

// Create session
app.post("/sessions", (req, res) => {
  const { name } = req.body;

  if (!name) return res.status(400).json({ error: "Invalid name" });

  const sessionId = randomUUID().slice(0, 6);
  const userId = randomUUID();

  const user: User = {
    id: userId,
    name,
    excludedUserIds: [userId], // auto-exclude self
    ready: false,
  };

  const session: Session = {
    id: sessionId,
    users: new Map([[userId, user]]),
  };

  sessions.set(sessionId, session);
  res.json({ sessionId, userId });
});

// Join session
app.post("/sessions/:id/join", (req, res) => {
  const session = sessions.get(req.params.id);
  const { name } = req.body;

  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!name) return res.status(400).json({ error: "Invalid name" });

  if ([...session.users.values()].some(u => u.name === name)) {
    return res.status(400).json({ error: "Name already used" });
  }

  const userId = randomUUID();

  session.users.set(userId, {
    id: userId,
    name,
    excludedUserIds: [userId],
    ready: false,
  });

  res.json({ userId });
});

// Get session
app.get("/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  res.json({
    id: session.id,
    users: Array.from(session.users.values()).map(u => ({
      id: u.id,
      name: u.name,
      ready: u.ready,
      excludedUserIds: u.excludedUserIds,
    })),
    hasResult: !!session.assignments,
  });
});

// Toggle exclusion
app.post("/sessions/:id/exclusions", (req, res) => {
  const { userId, excludedUserId } = req.body;
  const session = sessions.get(req.params.id);

  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.assignments) {
    return res.status(400).json({ error: "Draw already done" });
  }

  const user = session.users.get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (userId === excludedUserId) {
    return res.status(400).json({ error: "Cannot exclude yourself" });
  }

  const index = user.excludedUserIds.indexOf(excludedUserId);
  if (index === -1) {
    user.excludedUserIds.push(excludedUserId);
  } else {
    user.excludedUserIds.splice(index, 1);
  }

  // reset ready
  session.users.forEach(u => (u.ready = false));

  res.json({ excludedUserIds: user.excludedUserIds });
});

// Set ready
app.post("/sessions/:id/ready", (req, res) => {
  const session = sessions.get(req.params.id);
  const userId = req.headers["x-user-id"];

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId manquant ou invalide" });
  }

  const user = session.users.get(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.ready = true;

  // si tout le monde est prêt → générer le tirage
  const allReady = Array.from(session.users.values()).every(u => u.ready);

  if (allReady && !session.assignments) {
    session.assignments = generateAssignments(
      Array.from(session.users.values())
    );
  }

  res.json({ status: "ready" });
});



// Get result
app.get("/sessions/:id/result", (req, res) => {
  const { userId } = req.query;
  const session = sessions.get(req.params.id);

  if (!session || !session.assignments) {
    return res.status(400).json({ error: "No result yet" });
  }

  const result = session.assignments.get(userId as string);
  if (!result) return res.status(404).json({ error: "Result not found" });

  const assignedUser = session.users.get(result);
  res.json({ name: assignedUser?.name });
});

/* =======================
   Start
======================= */
app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Backend running on ${PORT}`);
});


