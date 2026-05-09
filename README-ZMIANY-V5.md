# Zmiany w wersji v5

Wprowadzono poprawki wskazane po pierwszym uruchomieniu aplikacji:

- nośnik może być przypisany do kilku modeli sklepów,
- dla każdego wybranego modelu nośnika wybierana jest kategoria z tego modelu,
- model sklepu może mieć zdjęcie,
- zdjęcie modelu jest widoczne w zakładce „Modele i kategorie” oraz na stronie tytułowej PDF dla eksportu modelu,
- w tabeli nośników zmieniono kolejność kolumn na „Nazwa”, „ID”, dalej bez zmian,
- przyciski eksportu PDF są zielone,
- tagi w formularzu nośnika i zdjęcia są wybierane przez rozwijane menu z wyszukiwarką i wielokrotnym wyborem,
- zdjęcia w bibliotece nie są przycinane, tylko skalowane z zachowaniem proporcji,
- zdjęcie ma edytowalną nazwę; domyślnie jest to nazwa pliku źródłowego,
- biblioteka zdjęć ma widok kafelkowy i listę,
- eksport PDF ma okno wyboru nazwy pliku i zakresu eksportu,
- eksport PDF obsługuje: wszystkie nośniki albo nośniki wskazanego modelu sklepu,
- po eksporcie PDF pojawia się komunikat sukcesu,
- w PDF zmieniono tytuł na „Inwentaryzacja nośników”,
- w PDF wyróżniono nagłówki danych technicznych,
- zdjęcia w PDF są skalowane w oryginalnych proporcjach, a pole zdjęcia powiększono o 10%.

Uwaga techniczna: istniejąca baza SQLite zostanie zmigrowana automatycznie przez dodanie nowych kolumn i tabeli `carrier_models`.
