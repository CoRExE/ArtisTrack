import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  Radio,
  CheckCircle2,
  Clock,
  Ticket,
  Calendar,
  AlertCircle,
  Bus,
  X,
  Check,
  Copy,
  Trash2,
  Sparkles,
} from 'lucide-react-native';
import { colors } from '../theme/colors';
import { PassPassCardData } from '../types/passPass';
import {
  initNfc,
  scanPassPassCard,
  loadCardFromStorage,
  clearSavedCard,
  getDemoCardData,
  isNativeNfcAvailable,
} from '../services/nfcPassPassService';

function formatValidationDate(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('fr-FR', { month: 'short' });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const capDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${capDayName} ${day} ${month} ${year} à ${time}`;
}

export const PassPassScreen: React.FC = () => {
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanStep, setScanStep] = useState<'ready' | 'reading' | 'success'>('ready');
  const [cardData, setCardData] = useState<PassPassCardData | null>(null);
  const [copiedDump, setCopiedDump] = useState(false);

  const isExpoGo = !isNativeNfcAvailable();

  // Charger la carte réellement scannée depuis le stockage local
  useEffect(() => {
    async function loadSaved() {
      await initNfc();
      const saved = await loadCardFromStorage();
      if (saved) {
        setCardData(saved);
      }
    }
    loadSaved();
  }, []);

  const handleOpenScan = () => {
    setScanStep('ready');
    setShowScanModal(true);

    if (!isExpoGo) {
      runRealNfcScan();
    }
  };

  const runRealNfcScan = async () => {
    try {
      setScanStep('ready');
      const data = await scanPassPassCard();
      setScanStep('reading');
      setTimeout(() => {
        setScanStep('success');
        setTimeout(() => {
          setCardData(data);
          setShowScanModal(false);
        }, 800);
      }, 600);
    } catch (err: any) {
      setShowScanModal(false);
    }
  };

  const handleSimulateScan = () => {
    setScanStep('reading');
    setTimeout(() => {
      setScanStep('success');
      setTimeout(() => {
        const demo = getDemoCardData('subscription');
        setCardData(demo);
        setShowScanModal(false);
      }, 700);
    }, 900);
  };

  const handleCopyRawDump = async () => {
    if (!cardData?.rawDump) {
      Alert.alert('Aucune donnée', 'Aucun enregistrement brut disponible.');
      return;
    }
    const json = JSON.stringify(cardData.rawDump, null, 2);
    await Clipboard.setStringAsync(json);
    setCopiedDump(true);
    setTimeout(() => setCopiedDump(false), 3000);
    Alert.alert(
      'Données brutes copiées !',
      'Le dump Calypso de votre carte a été copié dans votre presse-papier. Collez-le dans notre échange pour que je décode précisément votre abonnement.'
    );
  };

  const handleForgetCard = async () => {
    Alert.alert(
      'Oublier cette carte',
      'Voulez-vous supprimer cette carte Pass Pass enregistrée de votre application ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await clearSavedCard();
            setCardData(null);
          },
        },
      ]
    );
  };

  const transfer = cardData?.transferStatus;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Carte Pass Pass Visuelle */}
      <View style={styles.cardWrapper}>
        <View style={styles.passPassCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardBrand}>pass<Text style={styles.cardBrandBold}>pass</Text></Text>
              <Text style={styles.cardSubBrand}>Hauts-de-France • Artis</Text>
            </View>
            <Radio size={24} color="#00D1B2" />
          </View>

          <View style={styles.cardMiddle}>
            <View style={styles.chipGraphic} />
            <Text style={styles.cardProfile}>
              {cardData ? cardData.profile : 'Aucune carte enregistrée'}
            </Text>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.cardId}>
              {cardData ? cardData.cardId : 'Approchez votre carte pour l\'enregistrer'}
            </Text>
            <Text style={styles.calypsoText}>CALYPSO</Text>
          </View>
        </View>
      </View>

      {/* Bouton de scan principal */}
      <View style={styles.scanSection}>
        <TouchableOpacity style={styles.scanButton} onPress={handleOpenScan}>
          <Radio size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
          <Text style={styles.scanButtonText}>
            {cardData ? 'Mettre à jour ma carte (Rescanner)' : 'Scanner ma carte Pass Pass'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Si aucune carte n'est encore enregistrée */}
      {!cardData && (
        <View style={styles.emptyCardState}>
          <View style={styles.emptyIconCircle}>
            <Radio size={36} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Enregistrez votre carte Pass Pass</Text>
          <Text style={styles.emptySubtitle}>
            Touchez le bouton ci-dessus pour scanner votre carte physique une première fois. Vos
            informations resteront ensuite mémorisées dans l'application.
          </Text>
        </View>
      )}

      {/* RÉSULTATS DE LA CARTE ENREGISTRÉE */}
      {cardData && (
        <View style={styles.detailsContainer}>
          {/* Widget Correspondance 1h */}
          <View
            style={[
              styles.transferCard,
              transfer?.isActive ? styles.transferCardActive : styles.transferCardInactive,
            ]}
          >
            <View style={styles.transferHeader}>
              {transfer?.isActive ? (
                <CheckCircle2 size={22} color={colors.success} />
              ) : (
                <Clock size={22} color={colors.textSecondary} />
              )}
              <Text
                style={[
                  styles.transferTitle,
                  transfer?.isActive ? styles.transferTitleActive : styles.transferTitleInactive,
                ]}
              >
                {transfer?.isActive
                  ? 'Correspondance autorisée (1h)'
                  : 'Aucune correspondance en cours'}
              </Text>
            </View>

            {transfer?.isActive ? (
              <View style={styles.transferBody}>
                <Text style={styles.transferCount}>{transfer.minutesRemaining}</Text>
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.transferUnit}>minutes</Text>
                  <Text style={styles.transferSub}>restantes gratuites</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.transferSubInactive}>
                Votre prochain passage comptera comme un nouveau voyage.
              </Text>
            )}

            {transfer?.lastValidationTime && (
              <Text style={styles.lastValText}>
                Dernière validation à{' '}
                {transfer.lastValidationTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}
          </View>

          {/* Titres et Contrats */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Titres & Abonnements chargés</Text>

            {cardData.contracts.map((contract) => (
              <View key={contract.id} style={styles.contractItem}>
                <View style={styles.contractIconCircle}>
                  {contract.type === 'carnet' ? (
                    <Ticket size={20} color={colors.secondary} />
                  ) : (
                    <Calendar size={20} color={colors.primary} />
                  )}
                </View>

                <View style={styles.contractInfo}>
                  <Text style={styles.contractTitle}>{contract.name}</Text>
                  <Text style={styles.contractNetwork}>{contract.network}</Text>

                  {contract.validUntil && (
                    <Text style={styles.contractDate}>
                      Valable du {contract.validFrom} au {contract.validUntil}
                    </Text>
                  )}
                </View>

                {contract.balance !== undefined && (
                  <View style={styles.balanceBadge}>
                    <Text style={styles.balanceNumber}>{contract.balance}</Text>
                    <Text style={styles.balanceLabel}>voyages</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Historique des Validations & Passages */}
          {cardData.validations && cardData.validations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>Derniers passages enregistrés</Text>

              {cardData.validations.map((val, idx) => (
                <View
                  key={idx}
                  style={[styles.valItem, idx > 0 && styles.valItemBorder]}
                >
                  <View
                    style={[
                      styles.valIconCircle,
                      val.isTransfer ? styles.valIconTransfer : styles.valIconRegular,
                    ]}
                  >
                    <Bus size={18} color={val.isTransfer ? colors.success : colors.primary} />
                  </View>

                  <View style={styles.valInfo}>
                    <View style={styles.valHeaderRow}>
                      <Text style={styles.valLine}>{val.lineName || 'Réseau Artis'}</Text>
                      {val.isTransfer ? (
                        <View style={styles.transferBadge}>
                          <Text style={styles.transferBadgeText}>Correspondance</Text>
                        </View>
                      ) : (
                        <View style={styles.regularBadge}>
                          <Text style={styles.regularBadgeText}>Montée</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.valTime}>{formatValidationDate(val.timestamp)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Bouton Diagnostic / Copier les données brutes de la vraie carte */}
          {cardData.rawDump && (
            <View style={styles.dumpCard}>
              <View style={styles.dumpCardLeft}>
                <Text style={styles.dumpTitle}>Diagnostic technique</Text>
                <Text style={styles.dumpSub}>
                  {cardData.rawDump.ACTIVE_MODE && cardData.rawDump.ACTIVE_MODE !== 'UNKNOWN'
                    ? `${cardData.rawDump.ACTIVE_MODE} • ${cardData.rawDump.ACTIVE_CLA || ''}`
                    : 'Permet de décoder avec exactitude votre abonnement Artis.'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.dumpButton, copiedDump && styles.dumpButtonCopied]}
                onPress={handleCopyRawDump}
              >
                {copiedDump ? (
                  <>
                    <Check size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.dumpBtnText}>Copié !</Text>
                  </>
                ) : (
                  <>
                    <Copy size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.dumpBtnText}>Copier le Dump</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Bouton pour oublier la carte */}
          <TouchableOpacity style={styles.forgetBtn} onPress={handleForgetCard}>
            <Trash2 size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={styles.forgetBtnText}>Oublier cette carte</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* MODALE DE SCAN NFC */}
      <Modal
        visible={showScanModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowScanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalGrabber} />

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowScanModal(false)}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.modalGraphicContainer}>
              {scanStep === 'ready' && (
                <View style={styles.radarCircleOuter}>
                  <View style={styles.radarCircleMid}>
                    <View style={styles.radarCircleInner}>
                      <Radio size={36} color="#00D1B2" />
                    </View>
                  </View>
                </View>
              )}

              {scanStep === 'reading' && (
                <View style={styles.radarCircleOuter}>
                  <ActivityIndicator size="large" color="#00D1B2" />
                </View>
              )}

              {scanStep === 'success' && (
                <View style={[styles.radarCircleOuter, { borderColor: colors.success }]}>
                  <View style={[styles.radarCircleInner, { backgroundColor: colors.success }]}>
                    <Check size={36} color="#FFFFFF" />
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.modalTitle}>
              {scanStep === 'ready'
                ? 'Prêt à scanner'
                : scanStep === 'reading'
                ? 'Lecture de la carte...'
                : 'Carte Pass Pass lue !'}
            </Text>

            <Text style={styles.modalSubtitle}>
              {scanStep === 'ready'
                ? 'Approchez votre carte Pass Pass du haut ou du dos de votre téléphone.'
                : scanStep === 'reading'
                ? 'Décodage des contrats et du solde Calypso en cours...'
                : 'Titres et correspondance mis à jour et enregistrés.'}
            </Text>

            {isExpoGo && scanStep === 'ready' && (
              <View style={styles.modalExpoGoBox}>
                <Text style={styles.modalExpoGoHint}>
                  📱 Sur Expo Go (sans le build autonome), vous pouvez tester en simulant l'approche :
                </Text>
                <TouchableOpacity
                  style={styles.modalSimulateBtn}
                  onPress={handleSimulateScan}
                >
                  <Sparkles size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.modalSimulateBtnText}>
                    Simuler l'approche d'une carte
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowScanModal(false)}
            >
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  cardWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  passPassCard: {
    width: '100%',
    height: 190,
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#30184A',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBrand: {
    fontSize: 22,
    color: '#00D1B2',
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  cardBrandBold: {
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardSubBrand: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  cardMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipGraphic: {
    width: 34,
    height: 26,
    borderRadius: 5,
    backgroundColor: '#E5C07B',
    marginRight: 12,
  },
  cardProfile: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardId: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    letterSpacing: 1,
  },
  calypsoText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
    letterSpacing: 1,
  },
  scanSection: {
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCardState: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  detailsContainer: {
    gap: 16,
  },
  transferCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
  },
  transferCardActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  transferCardInactive: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  transferTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  transferTitleActive: {
    color: colors.success,
  },
  transferTitleInactive: {
    color: colors.textSecondary,
  },
  transferBody: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginVertical: 4,
  },
  transferCount: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.success,
  },
  transferUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  transferSub: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  transferSubInactive: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  lastValText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  contractItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  contractIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contractInfo: {
    flex: 1,
  },
  contractTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  contractNetwork: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  contractDate: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 54,
  },
  balanceNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.secondary,
  },
  balanceLabel: {
    fontSize: 10,
    color: colors.secondary,
    fontWeight: '600',
  },
  valItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  valItemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  valIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  valIconRegular: {
    backgroundColor: colors.primaryLight,
  },
  valIconTransfer: {
    backgroundColor: '#E8F5E9',
  },
  valInfo: {
    flex: 1,
  },
  valHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  valLine: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  valTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  transferBadge: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  transferBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  regularBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  regularBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  dumpCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(19, 71, 133, 0.15)',
  },
  dumpCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  dumpTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  dumpSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dumpButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dumpButtonCopied: {
    backgroundColor: colors.success,
  },
  dumpBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  forgetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  forgetBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Modale de scan
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  modalGrabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    padding: 6,
  },
  modalGraphicContainer: {
    marginVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCircleOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(0, 209, 178, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 209, 178, 0.05)',
  },
  radarCircleMid: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    borderColor: 'rgba(0, 209, 178, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 209, 178, 0.1)',
  },
  radarCircleInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#30184A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  modalExpoGoBox: {
    width: '100%',
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    alignItems: 'center',
  },
  modalExpoGoHint: {
    fontSize: 12,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 18,
  },
  modalSimulateBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    width: '100%',
  },
  modalSimulateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalCancelBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
