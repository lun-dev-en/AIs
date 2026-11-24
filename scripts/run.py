"""Start the two loopback-only app servers in one terminal."""
import argparse
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def stop(process):
    if process.poll() is not None:
        return
    try:
        if os.name == 'nt':
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=7)
    except (OSError, subprocess.TimeoutExpired):
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
        else:
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def main():
    def interrupt(*_):
        raise KeyboardInterrupt

    if os.name == 'nt':
        signal.signal(signal.SIGBREAK, interrupt)
    parser = argparse.ArgumentParser(description='Personality Lab local launcher')
    parser.add_argument('--production', action='store_true', help='Run the previously built frontend')
    args = parser.parse_args()
    node = shutil.which('node')
    next_cli = ROOT / 'frontend' / 'node_modules' / 'next' / 'dist' / 'bin' / 'next'
    if not node or not next_cli.exists():
        sys.exit('Node.js または依存ライブラリがありません。README.md の初期設定を実行してください。')
    if args.production and not (ROOT / 'frontend' / '.next' / 'BUILD_ID').exists():
        sys.exit('先に frontend で npm.cmd run build を実行してください。')
    for port in (3000, 8000):
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                sys.exit(f'ポート {port} は使用中です。起動済みのアプリを停止してください。')
    env = {**os.environ, 'NEXT_TELEMETRY_DISABLED': '1'}
    options = {'env': env}
    if os.name == 'nt':
        options['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options['start_new_session'] = True
    processes = []
    try:
        processes.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app',
                                          '--host', '127.0.0.1', '--port', '8000'], cwd=ROOT / 'backend', **options))
        processes.append(subprocess.Popen([node, str(next_cli), 'start' if args.production else 'dev',
                                          '--hostname', '127.0.0.1', '--port', '3000'], cwd=ROOT / 'frontend', **options))
        print('\nPersonality Lab: http://127.0.0.1:3000\n終了: Ctrl+C\n', flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(.5)
        print('サーバーが終了しました。もう一方のサーバーも停止します。', flush=True)
    except KeyboardInterrupt:
        print('\nPersonality Lab を終了しています…', flush=True)
    finally:
        for process in reversed(processes):
            stop(process)


if __name__ == '__main__':
    main()
