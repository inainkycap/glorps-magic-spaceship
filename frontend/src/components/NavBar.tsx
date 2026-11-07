import { NavLink } from "react-router";
import FuelGauge from "./FuelGauge";

export default function NavBar() {
  return (
    <header className="navbar">
      <span className="brand">Glorp's Magic Spaceship</span>
      <div className="hud-right">
        <FuelGauge />
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
