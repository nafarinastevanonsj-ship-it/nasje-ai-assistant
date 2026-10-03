require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

const app = express();

/* ==============================
   CONFIGURATION
============================== */

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const NASJE_API_KEY = process.env.NASJE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* ==============================
   VERIFICATION
============================== */

if (!OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is missing.");
    process.exit(1);
}

if (!NASJE_API_KEY) {
    console.error("ERROR: NASJE_API_KEY is missing.");
    process.exit(1);
}

/* ==============================
   OPENAI
============================== */

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

/* ==============================
   EXPRESS
============================== */

app.disable("x-powered-by");

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "x-api-key"]
    })
);

app.use(
    express.json({
        limit: "1mb"
    })
);

/* ==============================
   RATE LIMIT
============================== */

const chatLimiter = rateLimit({
    windowMs: Number(
        process.env.RATE_LIMIT_WINDOW_MS || 60000
    ),

    limit: Number(
        process.env.RATE_LIMIT_MAX || 30
    ),

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        error: {
            code: "RATE_LIMITED",
            message: "Trop de requêtes. Réessayez plus tard."
        }
    }
});

/* ==============================
   NASJE AI
============================== */

const NASJE_INSTRUCTIONS = `
Tu es NASJE AI, l'assistant IA de NASJE PRODUCTION.

Réponds clairement et utilement.

Utilise automatiquement la langue principale de l'utilisateur.

Si l'utilisateur écrit en français, réponds en français.
Si l'utilisateur écrit en anglais, réponds en anglais.
Si l'utilisateur écrit en malgache, réponds en malgache.

Ne prétends jamais être humain.

Ne prétends jamais avoir effectué une action que tu n'as pas réellement effectuée.

Si une information est incertaine, indique-le clairement.

Ne fabrique pas d'informations.

Pour les questions techniques, donne des explications précises.

Pour la programmation, donne du code propre et complet lorsque cela est nécessaire.

Sois respectueux et facile à comprendre.

Tu es l'assistant IA de NASJE PRODUCTION.
`;

/* ==============================
   AUTHENTIFICATION
============================== */

function authenticate(req, res, next) {

    const apiKey = req.get("x-api-key");

    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: {
                code: "MISSING_API_KEY",
                message: "x-api-key est obligatoire."
            }
        });
    }

    if (apiKey !== NASJE_API_KEY) {
        return res.status(401).json({
            success: false,
            error: {
                code: "INVALID_API_KEY",
                message: "Clé NASJE AI invalide."
            }
        });
    }

    next();
}

/* ==============================
   HOME
============================== */

app.get("/", (req, res) => {

    res.status(200).json({
        success: true,
        name: "NASJE AI API",
        version: "1.0.0",
        status: "online",
        company: "NASJE PRODUCTION"
    });

});

/* ==============================
   HEALTH
============================== */

app.get("/health", (req, res) => {

    res.status(200).json({
        success: true,
        status: "online",
        service: "NASJE AI API",
        version: "1.0.0",
        model: MODEL,
        time: new Date().toISOString()
    });

});

/* ==============================
   API INFO
============================== */

app.get("/api", (req, res) => {

    res.status(200).json({
        success: true,
        name: "NASJE AI API",
        version: "1.0.0",

        endpoints: {
            home: "GET /",
            health: "GET /health",
            chat: "POST /v1/chat"
        }
    });

});

/* ==============================
   CHAT
============================== */

app.post(
    "/v1/chat",
    authenticate,
    chatLimiter,
    async (req, res) => {

        try {

            const message =
                typeof req.body?.message === "string"
                    ? req.body.message.trim()
                    : "";

            if (!message) {

                return res.status(400).json({
                    success: false,
                    error: {
                        code: "INVALID_MESSAGE",
                        message: "Le champ message est obligatoire."
                    }
                });

            }

            if (message.length > 10000) {

                return res.status(400).json({
                    success: false,
                    error: {
                        code: "MESSAGE_TOO_LONG",
                        message: "Le message est trop long."
                    }
                });

            }

            const conversationId =
                typeof req.body?.conversation_id === "string"
                    ? req.body.conversation_id.trim()
                    : "";

            const request = {

                model: MODEL,

                instructions: NASJE_INSTRUCTIONS,

                input: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text: message
                            }
                        ]
                    }
                ]

            };

            if (conversationId) {
                request.conversation = conversationId;
            }

            const response =
                await openai.responses.create(request);

            return res.status(200).json({

                success: true,

                response_id: response.id,

                conversation_id:
                    conversationId || null,

                model: MODEL,

                reply:
                    response.output_text || ""

            });

        } catch (error) {

            console.error("CHAT_ERROR:", error);

            return res.status(502).json({

                success: false,

                error: {
                    code: "AI_PROVIDER_ERROR",
                    message:
                        "NASJE AI n'a pas pu générer une réponse."
                }

            });

        }

    }
);

/* ==============================
   404
============================== */

app.use((req, res) => {

    res.status(404).json({

        success: false,

        error: {
            code: "NOT_FOUND",
            message: "Route introuvable."
        }

    });

});

/* ==============================
   ERREURS
============================== */

app.use((err, req, res, next) => {

    console.error("SERVER_ERROR:", err);

    if (
        err instanceof SyntaxError &&
        err.status === 400
    ) {

        return res.status(400).json({

            success: false,

            error: {
                code: "INVALID_JSON",
                message: "JSON invalide."
            }

        });

    }

    return res.status(500).json({

        success: false,

        error: {
            code: "INTERNAL_ERROR",
            message: "Erreur interne du serveur."
        }

    });

});

/* ==============================
   START SERVER
============================== */

app.listen(PORT, HOST, () => {

    console.log("================================");
    console.log("       NASJE AI API");
    console.log("       NASJE PRODUCTION");
    console.log("================================");

    console.log("PORT:", PORT);
    console.log("HOST:", HOST);
    console.log("MODEL:", MODEL);
    console.log("STATUS: ONLINE");

    console.log("================================");

});