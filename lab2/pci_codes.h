 #ifndef PCI_CODES_H
 #define PCI_CODES_H

 typedef struct _PCI_VENTABLE
 {
     unsigned short VenId;
     const char *VenShort;
     const char *VenFull;
 } PCI_VENTABLE;

 extern PCI_VENTABLE PciVenTable[];
extern int PciVenTableCount;

 #endif // PCI_CODES_H
