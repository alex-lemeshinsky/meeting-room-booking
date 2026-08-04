import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../components/shell/toast-provider";

export function useNotificationStream(): void {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    const eventSource = new EventSource("/events", { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notification") {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          showToast({
            message: "У вас нове сповіщення про бронювання",
            type: "info"
          });
        }
      } catch {
        // Ignore malformed event payload
      }
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects; invalidate query on reconnect attempt
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    return () => {
      eventSource.close();
    };
  }, [queryClient, showToast]);
}
