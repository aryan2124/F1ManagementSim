import { CareerRoom, setEngine } from "./career-room";
import { careerEngine } from "../career/multi";
import { LeagueRoom } from "./league-room";

export { CareerRoom, LeagueRoom };

setEngine(careerEngine, careerEngine);

export interface Env {
  LEAGUE: DurableObjectNamespace<LeagueRoom>;
  CAREER: DurableObjectNamespace<CareerRoom>;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/league\/([A-Za-z0-9_-]{1,40})\/ws$/);
    if (match) {
      // One Durable Object per league code => one authoritative room per league.
      const stub = env.LEAGUE.get(env.LEAGUE.idFromName(match[1]));
      return stub.fetch(request);
    }
    const career = url.pathname.match(/^\/api\/career\/([A-Za-z0-9_-]{1,40})(?:\/ws)?$/);
    if (career) {
      // One Durable Object per career league code. The engine is plugged in with setEngine() from ./career-room.
      const stub = env.CAREER.get(env.CAREER.idFromName(career[1]));
      return stub.fetch(request);
    }
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, game: "box-box" });
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
