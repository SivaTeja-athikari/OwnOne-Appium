import { useAppNetworkState } from '@/hooks/use-app-network';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/state/auth-store';

/** Connection availability is distinct from server-confirmed report delivery. */
export function OfflineStatusBanner() {
  const network = useAppNetworkState();
  const theme = useTheme();
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const token = useAuthStore(s => s.authToken);
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const checking = network.isConnected === undefined;
  const recovering = authenticated && !token && !offline;
  const label = offline ? 'Offline' : checking ? 'Checking' : recovering ? 'Reconnecting' : 'Online';
  const color = offline ? theme.danger : recovering || checking ? theme.accent : theme.success;
  return <View testID={offline ? 'offline_status_banner' : 'network_status_bar'} style={[styles.bar,{ backgroundColor:theme.surface,borderColor:theme.border }]}>
    <View testID="network_status_pill" accessible accessibilityLabel={`Network: ${label}`} accessibilityLiveRegion="polite" style={[styles.pill,{ backgroundColor:`${color}14` }]}>
      {checking || recovering ? <ActivityIndicator size="small" color={color} /> : <View style={[styles.dot,{ backgroundColor:color }]} />}
      <Text style={{ color,fontWeight:'700',fontSize:12 }}>{label}</Text>
    </View>
    <Text style={[styles.hint,{ color:theme.textSecondary }]}>{checking ? 'Checking connection…' : offline ? authenticated ? 'Keep working · sync later' : 'Connect to sign in' : recovering ? 'Resuming automatically…' : authenticated ? 'Drafts save locally' : 'Ready to sign in'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  bar:{ flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,paddingHorizontal:20,paddingVertical:7,borderBottomWidth:StyleSheet.hairlineWidth },
  pill:{ flexDirection:'row',alignItems:'center',gap:6,borderRadius:8,paddingHorizontal:10,paddingVertical:5 },
  dot:{ width:6,height:6,borderRadius:3 },
  hint:{ flex:1,minWidth:120,fontSize:11,lineHeight:16,textAlign:'right' },
});
