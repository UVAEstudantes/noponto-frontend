import { Text, View } from 'react-native'; 
import { Bus } from 'lucide-react-native'; 

export default function HomeScreen() { 
    return ( 
        <View className="flex-1 justify-center items-center bg-white"> 
        <Bus size={48} color="black" /> 
        </View> 
    ); }