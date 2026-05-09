# Repetytorium POS — uruchomienie jako aplikacja `.exe`

Ten projekt jest przygotowany tak, aby dało się z niego wygenerować zwykły instalator Windows.

## Ważne rozróżnienie

- Klient końcowy nie potrzebuje Node.js, Rust ani Tauri CLI.
- Te narzędzia są potrzebne tylko osobie, która buduje instalator `.exe` / `.msi`.

Po zbudowaniu klient dostaje plik instalacyjny, np.:

```text
Repetytorium POS Setup.exe
```

albo:

```text
Repetytorium POS.msi
```

## Opcja 1 — automatyczne zbudowanie przez GitHub Actions

To najprostsza opcja, jeżeli projekt jest w repozytorium GitHub.

1. Wrzuć cały projekt do repozytorium GitHub.
2. Wejdź w zakładkę **Actions**.
3. Wybierz workflow **Build Windows installer**.
4. Kliknij **Run workflow**.
5. Po zakończeniu pobierz artefakt **Repetytorium-POS-Windows**.
6. W środku będą pliki `.exe` i/lub `.msi`.

Workflow znajduje się tutaj:

```text
.github/workflows/windows-build.yml
```

## Opcja 2 — zbudowanie lokalnie na Windows

Na komputerze osoby budującej instalator muszą być zainstalowane:

- Node.js LTS,
- Rust,
- Microsoft Visual Studio Build Tools z opcją **Desktop development with C++**.

Następnie można uruchomić:

```text
scripts/build-windows.bat
```

Po zakończeniu instalator powinien być w folderze:

```text
src-tauri\target\release\bundle\
```

## Gdzie aplikacja zapisuje dane?

Aplikacja zapisuje dane lokalnie w katalogu danych aplikacji użytkownika. W tym katalogu znajduje się:

- baza SQLite,
- folder ze zdjęciami,
- folder z miniaturami.

Dzięki temu klient uruchamia zwykłą aplikację desktopową, a dane pozostają na jego komputerze.

## Co jeszcze warto dodać przed wersją produkcyjną?

- ikonę aplikacji,
- podpis cyfrowy instalatora,
- numerowanie wersji,
- automatyczny backup bazy,
- ekran ustawień z lokalizacją folderu danych,
- import/eksport pełnej bazy danych.
