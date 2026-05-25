import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  path: "/api/socket.io/",
  transports: ["polling", "websocket"],
});

socket.on("connect", () => {
  console.log("Connected successfully!");
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("Connection Error:", err.message);
  if (err.req) {
    console.error("Req details:", err.req);
  }
  process.exit(1);
});

console.log("Connecting...");
