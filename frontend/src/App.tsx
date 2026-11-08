import { Outlet, Route, Routes } from "react-router";
import NavBar from "./components/NavBar";
import ZorpsToasts from "./components/ZorpsToasts";
import MapScreen from "./screens/MapScreen";
import Explore from "./screens/Explore";
import Lab from "./screens/Lab";
import Sanctuary from "./screens/Sanctuary";
import SanctuaryDome from "./screens/SanctuaryDome";
import NotFound from "./screens/NotFound";

/** Layout for the regular (non-map) screens. */
function PageLayout() {
  return (
    <div className="app">
      <NavBar />
      <main className="screen">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        {/* The map is full-screen, with its own HUD */}
        <Route path="/" element={<MapScreen />} />
        <Route element={<PageLayout />}>
          <Route path="/explore/:speciesId" element={<Explore />} />
          <Route path="/lab/:speciesId" element={<Lab />} />
          <Route path="/sanctuary" element={<Sanctuary />} />
          <Route path="/sanctuary/:domeId" element={<SanctuaryDome />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      {/* "+N Zorps" popups, on every screen */}
      <ZorpsToasts />
    </>
  );
}
