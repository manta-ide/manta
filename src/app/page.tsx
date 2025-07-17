import ChatSidebar from "@/components/ChatSidebar";
import EditableComponent from "@/components/EditableComponent";
import SelectionOverlay from "@/components/SelectionOverlay";

export default function Home() {
  return (
    <div className="flex h-screen bg-white">
      <ChatSidebar />
      <main className="flex-1 relative">
        <EditableComponent />
        <SelectionOverlay />
      </main>
    </div>
  );
}
