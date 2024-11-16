import HomePage from "@/routes/_index";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { initalizeBroadcastState } from "./lib/features/broadcast/localMedia";

initalizeBroadcastState();

function App() {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>
    </>
  );
}

export default App;
