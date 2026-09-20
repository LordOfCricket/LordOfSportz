import type { UserRole } from "@karate/types";

export function roleHomePath(role: UserRole): "/player" | "/coach" | "/academy" | "/scorer" {
  switch (role) {
    case "PLAYER":
      return "/player";
    case "COACH":
      return "/coach";
    case "ACADEMY":
      return "/academy";
    case "SCORER":
      return "/scorer";
  }
}
