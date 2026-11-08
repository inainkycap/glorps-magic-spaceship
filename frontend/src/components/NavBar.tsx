import { NavLink } from "react-router";
import ApiStatus from "./ApiStatus";
import ZorpsCounter from "./ZorpsCounter";

export default function NavBar() {
  return (
    <header className="navbar">
      <span className="brand">Glorp's Magic Spaceship</span>
      <div className="hud-right">
        <ApiStatus />
        <ZorpsCounter />
        <nav>
          <NavLink to="/" end>
            Map
          </NavLink>
          <NavLink to="/sanctuary">Sanctuary</NavLink>
        </nav>
      </div>
    </header>
  );
}
