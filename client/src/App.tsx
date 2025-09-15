import { CollabEditor } from "./component/CollabEditor";

function App() {
  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4">
        <h1 className="text-2xl font-bold">ProseMirror Collaborative Editor</h1>
      </header>
      <main className="flex-1">
        <CollabEditor docId="doc1" />
      </main>
    </div>
  );
}
export default App;
