import { useState } from 'react'
import Dashboard from './components/Dashboard';
import UploadScreen from './components/UploadScreen';
import './App.css'

export default function App() {
  const [screen, setScreen] = useState('d');

  return (
    <div className="app">
      {screen === 'upload' ? (
        <UploadScreen onDone={() => setScreen('dashboard')} />
      ) : (
        <Dashboard onBackToUpload={() => setScreen('upload')} />
      )}
    </div>
  );
}
