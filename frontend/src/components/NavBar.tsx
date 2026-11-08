import { NavLink } from "react-router";
import ApiStatus from "./ApiStatus";
import DiversityCounter from "./DiversityCounter";
import ZorpsCounter from "./ZorpsCounter";

export default function NavBar() {
  return (
    <header className="navbar">
      <span className="brand">Glorp's Magic Spaceship</span>
      <div className="hud-right">
        <ApiStatus />
        <ZorpsCounter />
        <DiversityCounter />
        <nav>
          <NavLink to="/" end>
            Map
          </NavLink>
          <NavLink to="/encyclopedia">Encyclopedia</NavLink>
          <NavLink to="/sanctuary">Sanctuary</NavLink>
        </nav>
      </div>
    </header>
  );
}
