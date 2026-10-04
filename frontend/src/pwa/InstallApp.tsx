import { useInstallPrompt } from './useInstallPrompt';

export default function InstallApp() {
  const { canInstall, promptInstall, isInstalled, isIos } = useInstallPrompt();

  if (isInstalled) return null;

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className="w-full px-4 py-2.5 rounded-xl font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
      >
        Instalar app
      </button>
    );
  }

  if (isIos) {
    return (
      <p className="text-xs text-slate-400">
        Para instalar: tocá Compartir y luego "Añadir a pantalla de inicio".
      </p>
    );
  }

  return null;
}
