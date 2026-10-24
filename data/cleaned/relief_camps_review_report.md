# Kerala Relief Camps: Unmapped Records & Coordinate Anomaly Audit Report

- **Source File**: `kerala_relief_camps.xlsx` (Sheet: `All Kerala `)
- **Compiled By**: `FaheedGISseoc@outlook.com` (Kerala State Emergency Operations Centre (SEOC GIS Cell))
- **Source Date**: `2020-08-05T16:04:01`
- **Audit Timestamp**: `2026-10-23T16:51:31.906137Z`

## 1. Executive Summary

| Metric | Count | Percentage |
| :--- | :--- | :--- |
| **Total Raw Source Rows** | 6377 | 100.0% |
| **Usable Mapped Safe-Spots** | 6001 | 94.10% |
| **- Direct Valid Coordinates** | 5998 | 94.06% |
| **- Swapped X/Y Coordinates Corrected** | 3 | 0.05% |
| **Excluded from Mapping (Review Required)** | 376 | 5.90% |
| **- Missing / Non-Numeric Coordinates** | 346 | 5.43% |
| **- Out-of-Bounds / Identical Lat-Lng / Zero Coordinates** | 30 | 0.47% |

## 2. Swapped Coordinate Records (Corrected with Provenance Flag)

The following 3 facilities had Latitude entered in column X and Longitude entered in column Y. They were corrected based on Kerala geographic bounding constraints and flagged with `coordinates_swapped: true`:

| Sl.No | District | Facility Name | Source Y (Lng) | Source X (Lat) | Corrected Lat | Corrected Lng |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 267 | Thiruvananthapuram | Nss HSS, Madavoor | 76.82004 | 8.8243358 | 8.824336 | 76.82004 |
| 278 | Thiruvananthapuram | Theruvarumukalil Auditorium | 76.818357 | 8.8136638 | 8.813664 | 76.818357 |
| 282 | Thiruvananthapuram | 1 Govt UPS Sarkara, Chirayinkeezhu
2  Govt  LPS Padanilam | 76.8496 | 8.7156 | 8.7156 | 76.8496 |

## 3. Excluded Records Audit Trail (Sample of 50 Out of Bounds / Missing)

| Sl.No | District | Village / LSG | Facility Name | Source Y | Source X | Audit Issue |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 132 | Thiruvananthapuram | Vellalloor | Peroor Vadasseri UPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 141 | Thiruvananthapuram | Kollayil | N K M High Scholl | 83.86315 | 77.128018 | Coordinates (83.86315, 77.128018) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 316 | Kollam | Mankode | GHSS chithara | 8.1459 | 84.1256 | Coordinates (8.1459, 84.1256) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 320 | Kollam | Mankode | Panchayat community hall | 8.451 | 71.2895 | Coordinates (8.451, 71.2895) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 321 | Kollam | Odanavattom | GHSS | 8.6 | 53.74 | Coordinates (8.6, 53.74) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 322 | Kollam | Odanavattom | HSS | 8.7 | 53.47 | Coordinates (8.7, 53.47) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 450 | Kollam | Kareepra | Vakkanadu HS | 8.93 | 7.74 | Coordinates (8.93, 7.74) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 980 | Pathanamthitta | Ezhumattoor | CMSLPS Kottankudy | 9.4320759 | 9.4320759 | Duplicate identical coordinates (lat=9.4320759, lng=9.4320759) |
| 1046 | Pathanamthitta | Ranni | GS Mundappuzha | null | null | Missing or non-numeric coordinate values in source workbook |
| 1400 | Alappuzha | Krishnapuram | Viswabharathi School | 12.68 | 78.64 | Coordinates (12.68, 78.64) outside realistic Kerala bounds (Lat [8.0, 13.0], Lng [74.5, 77.8]) |
| 1688 | Kottayam | Elamgulam | Reeth Church, Kandamchira | null | null | Missing or non-numeric coordinate values in source workbook |
| 1699 | Kottayam | Muttambalam | LFUPS pothi | null | null | Missing or non-numeric coordinate values in source workbook |
| 1705 | Kottayam | Kallara | Puzhavat.UPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 1717 | Kottayam | Meenachil | SKVUP School, Ilakkad | null | null | Missing or non-numeric coordinate values in source workbook |
| 1728 | Kottayam | Erumely North | HW UPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 1730 | Kottayam | Perumbaikkadu | Ayyankali Memorial Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1734 | Kottayam | Chembu | valiyamundakkal kudumba yogam hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1754 | Kottayam | Koruthodu | Govt. UPS  Vella | null | null | Missing or non-numeric coordinate values in source workbook |
| 1761 | Kottayam | Kadanad | Sisu Vihar | null | null | Missing or non-numeric coordinate values in source workbook |
| 1774 | Kottayam | Melukavu | mary | null | null | Missing or non-numeric coordinate values in source workbook |
| 1833 | Kottayam | Changanassery | SNDP HALL, VALLYADU | null | null | Missing or non-numeric coordinate values in source workbook |
| 1860 | Kottayam | TV PURAM | St. John's LPS, Parish Hall
 SN College | null | null | Missing or non-numeric coordinate values in source workbook |
| 1862 | Kottayam | Athirambuzha | Karippally Parish Hall, Pallichira | null | null | Missing or non-numeric coordinate values in source workbook |
| 1864 | Kottayam | Kangazha | St. Mary's Apitra | null | null | Missing or non-numeric coordinate values in source workbook |
| 1865 | Kottayam | VAIKOM | Consulatha LPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 1866 | Kottayam | muttambalam | S H L P PS | null | null | Missing or non-numeric coordinate values in source workbook |
| 1867 | Kottayam | Athirambuzha | Puthenpalli Parish Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1868 | Kottayam | permbayikadu | 154 SNDP Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1869 | Kottayam | Velloor | Carriel Community Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1870 | Kottayam | K S Mangalama | NNCJ MLPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 1871 | Kottayam | Chengalam | Nazareth Church Parish Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1875 | Kottayam | Kaddaplamattam | SC Community Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1892 | Kottayam | Koottikkalu | Panchayat Community Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 1893 | Kottayam | Nattakom | Thazhakkavayal Anganwadi | null | null | Missing or non-numeric coordinate values in source workbook |
| 1894 | Kottayam | Kottayam | Moonnilavu Anganwadi | null | null | Missing or non-numeric coordinate values in source workbook |
| 1900 | Kottayam | Udayanapuram | Govt.L.P.S Unnamattom | null | null | Missing or non-numeric coordinate values in source workbook |
| 1902 | Kottayam | Thiruvarppu | Govt L.P.S Thrikkoth | null | null | Missing or non-numeric coordinate values in source workbook |
| 1923 | Kottayam | Koruthodu | Gandhi Smaraka Hall Sarvodhyam | null | null | Missing or non-numeric coordinate values in source workbook |
| 1953 | Kottayam | Ayarkkunnam | Sisu Vihar | null | null | Missing or non-numeric coordinate values in source workbook |
| 1956 | Kottayam | Changanassery | Amanulla Building, Chanthakadavu | 0 | 0 | Duplicate identical coordinates (lat=0.0, lng=0.0) |
| 1958 | Kottayam | Melukavu | Anganwadi, Kachuvelikkunnu | 0 | 0 | Duplicate identical coordinates (lat=0.0, lng=0.0) |
| 1974 | Kottayam | THALAYAZHAM | GOVT TOWN LPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 1978 | Kottayam | Perumbaikkadu | GVHSS , VAIKOM WEST | null | null | Missing or non-numeric coordinate values in source workbook |
| 1983 | Kottayam | Erattupetta | AMRUTHA LODGE(NOW WORKING AS INSTITUITIONAL QUARANTINE CENTRE) | null | null | Missing or non-numeric coordinate values in source workbook |
| 1997 | Kottayam | Veloor | M.M.M.U.M.M.UPS | null | null | Missing or non-numeric coordinate values in source workbook |
| 2033 | Kottayam | Aymanam | Panchayath LPS Konippad | null | null | Missing or non-numeric coordinate values in source workbook |
| 2047 | Kottayam | Aymanam | Christine Meditation Center | null | null | Missing or non-numeric coordinate values in source workbook |
| 2059 | Kottayam | Moonnilavu | Chiramel Auditorium,Irumpoozhikara | null | null | Missing or non-numeric coordinate values in source workbook |
| 2070 | Kottayam | Nattakom | Muchoorkavu Community Hall | null | null | Missing or non-numeric coordinate values in source workbook |
| 2073 | Kottayam | Perumbaikkadu | Umbidi Samskarika Nilayam | null | null | Missing or non-numeric coordinate values in source workbook |

*(Full list of all 376 excluded records is available in `relief_camps_review_report.json`)*
