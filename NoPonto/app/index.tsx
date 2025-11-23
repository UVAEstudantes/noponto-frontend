import CampoBuscarLinha1 from '@/src/components/campoBuscaLinha1';
import Filtro from '@/src/components/filtro';
import LocalButton from '@/src/components/localButton';
import RotaButton from '@/src/components/rotaButton';
import { getCurrentPositionAsync, LocationAccuracy, LocationObject, requestForegroundPermissionsAsync, watchPositionAsync } from 'expo-location';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import MapView from "react-native-maps";

const Home = () => {

    const [transito, setTransito] = React.useState(false);

    function clickTransito(){
        setTransito(!transito);
        console.log("transito: ", transito);
    }

    const mapRef = React.useRef<MapView>(null);
    const [location, setLocation] = useState<LocationObject | null>(null);

    async function requestLocationPermissions() {

        const { granted } = await requestForegroundPermissionsAsync();

        if (granted) {
            const location = await getCurrentPositionAsync();
            setLocation(location);
        }
    }

    useEffect(() => {
        requestLocationPermissions();
    }, []);

    useEffect(()=> {
        watchPositionAsync({
            accuracy: LocationAccuracy.Highest,
            timeInterval: 1000,
            distanceInterval: 1,
        }, (response) => {
            setLocation(response);
        });
    }, []);

    return (
        <View className=" flex-1 justify-center items-center bg-white">

            {
                location &&

                <MapView 
                    style={{ width: '100%', height: '100%' }}
                    ref={mapRef}

                    mapType='standard' // tipo de mapa
                    showsUserLocation= {true}
                    followsUserLocation= {true}
                    showsMyLocationButton= {false}
                    showsTraffic={transito} // mostrar transito se clicar no check transito

                    customMapStyle={[ // remover os locais como lojas e coisas do tipo
                        {
                        featureType: "poi",
                        stylers: [{visibility: "off"}]
                        }
                    ]}

                    initialRegion={{
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        latitudeDelta: 0.002,
                        longitudeDelta: 0.002,
                    }}
                    
                />
                
            }
            <CampoBuscarLinha1 />
            <RotaButton />
            <LocalButton location={location} mapRef={mapRef}/>
            <Filtro transito={transito} clickTransito={clickTransito} />
            
        </View>
    )
}

export default Home; 