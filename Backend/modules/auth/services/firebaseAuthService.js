import admin from "firebase-admin";
import winston from "winston";
import { getFirebaseCredentials } from "../../../shared/utils/envService.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class FirebaseAuthService {
  constructor() {
    this.initialized = false;
    // Initialize asynchronously (don't await in constructor)
    this.init().catch((err) => {
      logger.error(`Error initializing Firebase: ${err.message}`);
    });
  }

  async init() {
    if (this.initialized) return;

    try {
      const dbCredentials = await getFirebaseCredentials();
      const projectId = dbCredentials.projectId;
      const clientEmail = dbCredentials.clientEmail;
      let privateKey = dbCredentials.privateKey;

      if (!projectId || !clientEmail || !privateKey) {
        logger.warn(
          "Firebase Admin not fully configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in Admin → Environment Variables.",
        );
        return;
      }

      // Handle escaped newlines in private key
      if (privateKey.includes("\\n")) {
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });

        this.initialized = true;
        logger.info("Firebase Admin initialized for auth verification");
      } catch (error) {
        // If already initialized, ignore the "app exists" error
        if (error?.code === "app/duplicate-app") {
          this.initialized = true;
          logger.warn(
            "Firebase Admin already initialized, reusing existing instance",
          );
          return;
        }

        logger.error(`Failed to initialize Firebase Admin: ${error.message}`);
      }
    } catch (error) {
      logger.error(`Error in Firebase init: ${error.message}`);
    }
  }

  isEnabled() {
    return this.initialized;
  }

  /**
   * Verify a Firebase ID token and return decoded claims
   * @param {string} idToken
   * @returns {Promise<admin.auth.DecodedIdToken>}
   */
  async verifyIdToken(idToken) {
    if (!this.initialized) {
      throw new Error(
        "Firebase Admin is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env",
      );
    }

    if (!idToken) {
      throw new Error("ID token is required");
    }

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      logger.info("Firebase ID token verified", {
        uid: decoded.uid,
        email: decoded.email,
      });
      return decoded;
    } catch (error) {
      logger.error(`Error verifying Firebase ID token: ${error.message}`, {
        code: error.code,
        message: error.message,
      });
      if (error.code === "auth/argument-error") {
        logger.warn(
          "Firebase project mismatch? Ensure backend FIREBASE_PROJECT_ID (service account) matches frontend Firebase app project.",
        );
      }
      throw new Error("Invalid or expired Firebase ID token");
    }
  }
}

export default new FirebaseAuthService();
