import express from "express";
import cartRoutes from "./routes/cartRoutes.js";

const router = express.Router();

router.use("/cart", cartRoutes);

export default router;
