// App root — wires routing across views

const { Shell } = window;

function App() {
  const [route, setRoute] = React.useState({ name: "dashboard" });
  const navigate = React.useCallback((r) => {
    setRoute(r);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Public page is full-screen, no shell
  if (route.name === "public") {
    return <window.PublicPage route={route} navigate={navigate} />;
  }

  let view = null;
  if (route.name === "dashboard") view = <window.Dashboard navigate={navigate} />;
  else if (route.name === "jobs") view = <window.JobsView navigate={navigate} />;
  else if (route.name === "job-detail") view = <window.JobDetail route={route} navigate={navigate} />;
  else if (route.name === "create-job") view = <window.CreateJob navigate={navigate} />;

  return (
    <div className="min-h-screen p-5">
      <div className="max-w-[1440px] mx-auto bg-white rounded-[18px] shadow-soft border border-slate-100 overflow-hidden flex">
        <Shell.Sidebar route={route} navigate={navigate} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Shell.Topbar route={route} navigate={navigate} />
          <div className="flex-1 min-w-0 overflow-x-hidden">
            {view}
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
