use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ApiDump {
    #[serde(rename = "Classes")]
    classes: Vec<ApiClass>,
}

#[derive(Debug, Deserialize)]
struct ApiClass {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Superclass")]
    superclass: String,
    #[serde(rename = "Members")]
    members: Vec<ApiMember>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "MemberType")]
enum ApiMember {
    Property(ApiProperty),
    Function(ApiFunction),
    Event(ApiEvent),
    Callback(()),
}

#[derive(Debug, Deserialize)]
struct ApiProperty {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "ValueType")]
    value_type: ApiType,
    #[serde(rename = "Tags", default)]
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ApiFunction {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "ReturnType")]
    return_type: ApiType,
    #[serde(rename = "Tags", default)]
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ApiEvent {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Parameters", default)]
    parameters: Vec<ApiParameter>,
}


#[derive(Debug, Deserialize)]
struct ApiType {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Category")]
    category: String,
}

#[derive(Debug, Deserialize)]
struct ApiParameter {
    #[serde(rename = "Type")]
    r#type: ApiType,
}

#[derive(Debug, Default)]
struct ApiIndex {
    properties: HashMap<String, HashMap<String, String>>,
    methods:    HashMap<String, HashMap<String, String>>,
    events:     HashMap<String, HashMap<String, Vec<String>>>,
    superclass: HashMap<String, String>,
}

impl ApiIndex {
    fn from_dump(dump: ApiDump) -> Self {
        let mut idx = Self::default();
        for class in dump.classes {
            let cn = class.name.to_ascii_lowercase();
            let sc = if class.superclass == "<<<ROOT>>>" {
                String::new()
            } else {
                class.superclass.to_ascii_lowercase()
            };
            idx.superclass.insert(cn.clone(), sc);
            let props   = idx.properties.entry(cn.clone()).or_default();
            let methods = idx.methods.entry(cn.clone()).or_default();
            let events  = idx.events.entry(cn.clone()).or_default();
            for member in class.members {
                match member {
                    ApiMember::Property(p) if !p.tags.iter().any(|t| t == "Deprecated") => {
                        props.insert(p.name.to_ascii_lowercase(), api_type_str(&p.value_type));
                    }
                    ApiMember::Function(f) if !f.tags.iter().any(|t| t == "Deprecated") => {
                        methods.insert(f.name.to_ascii_lowercase(), api_type_str(&f.return_type));
                    }
                    ApiMember::Event(e) => {
                        let params: Vec<String> =
                            e.parameters.iter().map(|p| api_type_str(&p.r#type)).collect();
                        events.insert(e.name.to_ascii_lowercase(), params);
                    }
                    _ => {}
                }
            }
        }
        idx
    }

    fn lookup_property(&self, class: &str, property: &str) -> Option<String> {
        let pn = property.to_ascii_lowercase();
        let mut cur = class.to_ascii_lowercase();
        loop {
            if let Some(v) = self.properties.get(&cur).and_then(|m| m.get(&pn)) {
                return Some(v.clone());
            }
            match self.superclass.get(&cur) {
                Some(sc) if !sc.is_empty() => cur = sc.clone(),
                _ => return None,
            }
        }
    }

    fn lookup_method(&self, class: &str, method: &str) -> Option<String> {
        let mn = method.to_ascii_lowercase();
        let mut cur = class.to_ascii_lowercase();
        loop {
            if let Some(v) = self.methods.get(&cur).and_then(|m| m.get(&mn)) {
                return Some(v.clone());
            }
            match self.superclass.get(&cur) {
                Some(sc) if !sc.is_empty() => cur = sc.clone(),
                _ => return None,
            }
        }
    }

    fn lookup_event_params(&self, class: &str, event: &str) -> Option<Vec<String>> {
        let en = event.to_ascii_lowercase();
        let mut cur = class.to_ascii_lowercase();
        loop {
            if let Some(v) = self.events.get(&cur).and_then(|m| m.get(&en)) {
                return Some(v.clone());
            }
            match self.superclass.get(&cur) {
                Some(sc) if !sc.is_empty() => cur = sc.clone(),
                _ => return None,
            }
        }
    }
}

fn api_type_str(t: &ApiType) -> String {
    match t.category.as_str() {
        "Primitive" => match t.name.as_str() {
            "bool"                     => "boolean".to_string(),
            "int" | "int64" | "float" | "double" => "number".to_string(),
            "string"                   => "string".to_string(),
            other                      => other.to_string(),
        },
        _ => t.name.clone(),
    }
}

static API_INDEX: OnceLock<Mutex<Option<ApiIndex>>> = OnceLock::new();

fn api_index() -> &'static Mutex<Option<ApiIndex>> {
    API_INDEX.get_or_init(|| Mutex::new(None))
}

pub fn load_api(path: &Path) -> Result<(), String> {
    let text  = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let dump: ApiDump = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let index = ApiIndex::from_dump(dump);
    *api_index().lock().unwrap_or_else(|e| e.into_inner()) = Some(index);
    Ok(())
}

pub fn api_loaded() -> bool {
    api_index().lock().ok().map(|g| g.is_some()).unwrap_or(false)
}

pub fn property_type_str(class: &str, property: &str) -> Option<String> {
    if api_loaded() {
        if let Some(ty) = api_index().lock().ok().and_then(|g| g.as_ref()?.lookup_property(class, property)) {
            return Some(ty);
        }
    }
    property_type_static(class, property).map(|s| s.to_string())
}

pub fn method_return_type_str(method: &str, receiver_type: &str) -> Option<String> {
    if api_loaded() {
        if let Some(ty) = api_index().lock().ok().and_then(|g| g.as_ref()?.lookup_method(receiver_type, method)) {
            return Some(ty);
        }
    }
    method_return_type_static(method).map(|s| s.to_string())
}

pub fn event_param_types(class: &str, event: &str) -> Option<Vec<String>> {
    api_index()
        .lock()
        .ok()
        .and_then(|g| g.as_ref()?.lookup_event_params(class, event))
}

pub fn property_type(class: &str, property: &str) -> Option<&'static str> {
    property_type_static(class, property)
}

fn property_type_static(_class: &str, property: &str) -> Option<&'static str> {
    match property.to_ascii_lowercase().as_str() {
        "cframe" | "pivotoffset" | "coordinateframe" => Some("CFrame"),
        "position" | "origin" | "lookvector" | "rightvector" | "upvector" | "normal" => Some("Vector3"),
        "velocity" | "rotvelocity" | "assemblylinearvelocity" | "assemblyangularvelocity" => Some("Vector3"),
        "size" | "extentssize" => Some("Vector3"),
        "color" | "colour" => Some("Color3"),
        "brickcolor" => Some("BrickColor"),
        "material" => Some("EnumItem"),
        "health" | "maxhealth" | "walkspeed" | "jumppower" | "hiphere" => Some("number"),
        "userid" | "accountage" | "distance" | "magnitude" => Some("number"),
        "name" | "classname" | "displayname" => Some("string"),
        "parent" | "primarypart" => Some("Instance"),
        "character" => Some("Model"),
        "humanoid" => Some("Humanoid"),
        "enabled" | "visible" | "active" | "cancollide" | "cantouch" | "anchored" => Some("boolean"),
        _ => None,
    }
}

fn method_return_type_static(method: &str) -> Option<&'static str> {
    match method {
        "GetPivot" | "GetModelCFrame" | "GetRenderCFrame" | "GetPrimaryPartCFrame"
        | "ToWorldSpace" | "ToObjectSpace" | "GetInverse" | "Orthonormalize" => Some("CFrame"),
        "GetPosition" | "GetModelSize" | "GetExtentsSize" => Some("Vector3"),
        "GetChildren" | "GetDescendants" | "GetPlayers" | "GetCharacters" => Some("Instance[]"),
        "GetPartsObscuringTarget" | "GetTouchingParts" | "GetConnectedParts" => Some("BasePart[]"),
        "GetAttributes" | "GetTags" => Some("table"),
        "GetMouse" => Some("Mouse"),
        "GetNetworkOwner" => Some("Player"),
        "GetFullName" | "GetDebugId" => Some("string"),
        "GetMass" => Some("number"),
        "GetPropertyChangedSignal" | "GetAttributeChangedSignal" => Some("RBXScriptSignal"),
        "IsA" | "IsDescendantOf" | "IsAncestorOf" | "HasTag" | "FuzzyEq" => Some("boolean"),
        "LoadAnimation" => Some("AnimationTrack"),
        "CreateTween" => Some("Tween"),
        "Raycast" | "Blockcast" | "Spherecast" => Some("RaycastResult"),
        "ScreenPointToRay" | "ViewportPointToRay" => Some("Ray"),
        "InvokeServer" | "InvokeClient" => Some("unknown"),
        "FindFirstAncestorOfClass" | "FindFirstAncestorWhichIsA"
        | "FindFirstChildOfClass" | "FindFirstChildWhichIsA"
        | "WaitForChild" | "FindFirstChild" | "Clone" => Some("Instance"),
        "Cross" | "Abs" | "Max" | "Min" | "Unit" => Some("Vector3"),
        "Dot" | "Angle" | "Magnitude" => Some("number"),
        "PointToWorldSpace" | "PointToObjectSpace"
        | "VectorToWorldSpace" | "VectorToObjectSpace" => Some("Vector3"),
        _ => None,
    }
}


pub fn constructor_type(expr: &str) -> Option<&'static str> {
    const PREFIXES: &[(&str, &str)] = &[
        ("CFrame.",           "CFrame"),
        ("Vector3.",          "Vector3"),
        ("Vector2.",          "Vector2"),
        ("UDim2.",            "UDim2"),
        ("UDim.new(",         "UDim"),
        ("Color3.",           "Color3"),
        ("BrickColor.",       "BrickColor"),
        ("TweenInfo.new(",    "TweenInfo"),
        ("NumberSequence.new(", "NumberSequence"),
        ("ColorSequence.new(", "ColorSequence"),
        ("Ray.new(",          "Ray"),
        ("Font.fromName(",    "Font"),
        ("Font.fromId(",      "Font"),
        ("Enum.",             "EnumItem"),
    ];
    for (prefix, ty) in PREFIXES {
        if expr.contains(prefix) { return Some(ty); }
    }
    None
}

pub fn new_call_type(class_name: &str) -> Option<&'static str> {
    match class_name {
        "RaycastParams"  => Some("RaycastParams"),
        "Random"         => Some("Random"),
        "Instance"       => Some("Instance"),
        "CFrame"         => Some("CFrame"),
        "Vector3"        => Some("Vector3"),
        "Vector2"        => Some("Vector2"),
        "UDim2"          => Some("UDim2"),
        "UDim"           => Some("UDim"),
        "Color3"         => Some("Color3"),
        "BrickColor"     => Some("BrickColor"),
        "TweenInfo"      => Some("TweenInfo"),
        "NumberSequence" => Some("NumberSequence"),
        "ColorSequence"  => Some("ColorSequence"),
        "Ray"            => Some("Ray"),
        _                => None,
    }
}

pub fn is_script_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "script" | "localscript" | "modulescript"
    )
}

pub fn is_remote_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "remoteevent" | "remotefunction" | "bindableevent" | "bindablefunction"
    )
}

pub fn is_viewport_context_class(class_name: &str) -> bool {
    matches!(
        class_name.to_ascii_lowercase().as_str(),
        "lighting" | "atmosphere" | "sky" | "colorcorrectioneffect" | "bloomeffect"
    )
}

pub fn is_container_path_segment(segment: &str) -> bool {
    matches!(
        segment,
        "game" | "ReplicatedStorage" | "ServerScriptService" | "ServerStorage"
            | "StarterPlayer" | "StarterGui" | "Workspace" | "Players" | "Modules"
            | "ModuleScripts" | "Scripts" | "LocalScripts" | "Config" | "Configs"
            | "Remotes" | "Shared" | "Common" | "Utils" | "Lib" | "Library"
            | "StarterCharacterScripts" | "StarterPlayerScripts"
    )
}

pub fn remote_direction(method: &str) -> &'static str {
    match method {
        "FireServer" | "InvokeServer"                   => "client_to_server",
        "FireClient" | "FireAllClients" | "InvokeClient" => "server_to_client",
        "OnServerEvent" | "OnServerInvoke" | "OnInvoke"  => "client_to_server",
        "OnClientEvent" | "OnClientInvoke"              => "server_to_client",
        _                                               => "unknown",
    }
}