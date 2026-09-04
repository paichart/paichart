import { PrismaClient } from '@prisma/client';
import { PhaseType } from '@prisma/client';

const prisma = new PrismaClient();

// Types for vendor configuration
interface VendorConfig {
  name: string;
  logo: string;
  primaryColor: string;
  website: string;
  supportContact: string;
}

interface ProductConfig {
  name: string;
  version: string;
  category: string;
  description: string;
}

interface TaskMetadata {
  technicalLevel: 'EXECUTIVE' | 'MANAGEMENT' | 'TECHNICAL' | 'PRODUCT_SPECIFIC';
  estimatedDuration: { value: number; unit: 'HOURS' | 'DAYS' | 'WEEKS' };
  requiredSkills: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  vendorSpecific: {
    productVersion: string;
    configurationCommands?: string[];
    documentationLinks?: string[];
    bestPractices?: string[];
    commonIssues?: string[];
  };
  configurationExamples?: string[];
  validationCriteria?: string[];
  troubleshootingTips?: string[];
}

interface TaskData {
  id: string;
  title: string;
  description: string;
  type: 'ACTION' | 'DECISION' | 'MILESTONE' | 'APPROVAL' | 'DOCUMENT';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  required: boolean;
  dependencies: string[];
  metadata: TaskMetadata;
}

interface StageData {
  name: string;
  description: string;
  order: number;
  dependencies: string[];
  tasks: TaskData[];
  metadata: {
    estimatedDuration: { value: number; unit: 'HOURS' | 'DAYS' | 'WEEKS' };
    requiredSkills: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

interface PhaseTemplateData {
  name: string;
  description: string;
  type: PhaseType;
  isDefault: boolean;
  workflow: {
    stages: StageData[];
    metadata: {
      vendor: VendorConfig;
      product: ProductConfig;
      demoContext: {
        targetAudience: string[];
        focusAreas: string[];
        competitiveAdvantages: string[];
      };
    };
  };
}

// Vendor configurations
const vendors = {
  cisco: {
    name: "Cisco",
    logo: "/logos/cisco.png",
    primaryColor: "#1BA0D7",
    website: "https://cisco.com",
    supportContact: "support@cisco.com"
  },
  paloAlto: {
    name: "Palo Alto Networks",
    logo: "/logos/palo-alto.png",
    primaryColor: "#FA582D",
    website: "https://paloaltonetworks.com",
    supportContact: "support@paloaltonetworks.com"
  },
  fortinet: {
    name: "Fortinet",
    logo: "/logos/fortinet.png",
    primaryColor: "#EE3124",
    website: "https://fortinet.com",
    supportContact: "support@fortinet.com"
  }
};

// Product configurations
const products = {
  ciscoFirepower: {
    name: "Cisco Firepower NGFW 4200 Series",
    version: "7.4.1",
    category: "security_appliance",
    description: "Next-Generation Firewall with advanced threat protection and network segmentation capabilities"
  },
  ciscoEmailGateway: {
    name: "Cisco Secure Email Gateway C695",
    version: "AsyncOS 15.0.1",
    category: "email_security",
    description: "Advanced email security with threat protection and data loss prevention"
  },
  ciscoWireless: {
    name: "Catalyst 9800 Wireless Controller",
    version: "IOS XE 17.12.01",
    category: "wireless_controller",
    description: "Enterprise wireless controller with advanced security and management features"
  },
  paloAltoNGFW: {
    name: "PA-5450 Next-Generation Firewall",
    version: "PAN-OS 11.1.2",
    category: "security_appliance",
    description: "High-performance next-generation firewall with advanced threat prevention"
  },
  fortiGate: {
    name: "FortiGate 4000E Series",
    version: "FortiOS 7.4.1",
    category: "security_appliance",
    description: "High-performance security appliance with integrated threat protection"
  }
};

// Template generators
class PhaseTemplateGenerator {
  generatePlanningPhase(vendor: VendorConfig, product: ProductConfig): PhaseTemplateData {
    return {
      name: `${product.name} - Planning Phase`,
      description: `Comprehensive planning phase for ${product.name} implementation including requirements gathering, architecture design, and risk assessment.`,
      type: PhaseType.PLANNING,
      isDefault: false,
      workflow: {
        stages: [
          {
            name: "Requirements Analysis",
            description: "Gather and analyze business and technical requirements",
            order: 1,
            dependencies: [],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-planning-req-001`,
                title: "Conduct Business Requirements Workshop",
                description: "Facilitate workshop with stakeholders to identify business objectives, compliance requirements, and success criteria for the implementation.",
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [],
                metadata: {
                  technicalLevel: "MANAGEMENT",
                  estimatedDuration: { value: 4, unit: "HOURS" },
                  requiredSkills: ["Business Analysis", "Stakeholder Management"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/planning`],
                    bestPractices: [
                      "Include all key stakeholders in requirements gathering",
                      "Document compliance and regulatory requirements",
                      "Define clear success metrics and KPIs"
                    ]
                  },
                  validationCriteria: [
                    "All stakeholders have provided input",
                    "Business requirements documented and approved",
                    "Success criteria clearly defined"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-planning-req-002`,
                title: "Technical Infrastructure Assessment",
                description: `Assess current network infrastructure, identify integration points, and evaluate compatibility with ${product.name}.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-planning-req-001`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 2, unit: "DAYS" },
                  requiredSkills: ["Network Architecture", `${vendor.name} Products`],
                  riskLevel: "HIGH",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/compatibility`],
                    bestPractices: [
                      "Document all network segments and VLANs",
                      "Identify potential integration challenges",
                      "Assess bandwidth and performance requirements"
                    ],
                    commonIssues: [
                      "Legacy system compatibility issues",
                      "Insufficient network bandwidth",
                      "VLAN configuration conflicts"
                    ]
                  },
                  configurationExamples: [
                    "Network topology diagram",
                    "VLAN configuration matrix",
                    "Integration architecture diagram"
                  ],
                  validationCriteria: [
                    "Complete network topology documented",
                    "Integration points identified and validated",
                    "Performance requirements assessed"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 1, unit: "WEEKS" },
              requiredSkills: ["Business Analysis", "Technical Architecture"],
              riskLevel: "MEDIUM"
            }
          },
          {
            name: "Architecture Design",
            description: "Design the technical architecture and implementation approach",
            order: 2,
            dependencies: ["Requirements Analysis"],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-planning-arch-001`,
                title: "Design Security Architecture",
                description: `Create detailed security architecture incorporating ${product.name} with existing infrastructure, including network segmentation, access controls, and threat protection strategies.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-planning-req-002`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 3, unit: "DAYS" },
                  requiredSkills: ["Security Architecture", "Network Design", `${vendor.name} Security`],
                  riskLevel: "HIGH",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [
                      `${vendor.website}/documentation/architecture`,
                      `${vendor.website}/best-practices/security-design`
                    ],
                    bestPractices: [
                      "Follow zero-trust security principles",
                      "Implement defense-in-depth strategy",
                      "Design for scalability and performance"
                    ]
                  },
                  configurationExamples: [
                    "Security zone configuration",
                    "Access control policies",
                    "Threat protection rules"
                  ],
                  validationCriteria: [
                    "Security architecture approved by security team",
                    "Design meets compliance requirements",
                    "Performance requirements validated"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 1, unit: "WEEKS" },
              requiredSkills: ["Security Architecture", "Network Design"],
              riskLevel: "HIGH"
            }
          }
        ],
        metadata: {
          vendor,
          product,
          demoContext: {
            targetAudience: ["TECHNICAL", "MANAGEMENT"],
            focusAreas: ["security", "planning", "architecture"],
            competitiveAdvantages: ["comprehensive_planning", "proven_methodology", "expert_guidance"]
          }
        }
      }
    };
  }

  generateImplementationPhase(vendor: VendorConfig, product: ProductConfig): PhaseTemplateData {
    return {
      name: `${product.name} - Implementation Phase`,
      description: `Complete implementation of ${product.name} including installation, configuration, testing, and integration with existing infrastructure.`,
      type: PhaseType.EXECUTION,
      isDefault: false,
      workflow: {
        stages: [
          {
            name: "Infrastructure Preparation",
            description: "Physical installation, rack setup, and initial device connectivity verification",
            order: 1,
            dependencies: [],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-impl-infra-001`,
                title: "Hardware Installation and Rack Setup",
                description: `Install ${product.name} hardware in data center rack, establish power connections, and complete network cabling according to the approved design.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 4, unit: "HOURS" },
                  requiredSkills: ["Hardware Installation", "Data Center Operations"],
                  riskLevel: "LOW",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/hardware-installation`],
                    bestPractices: [
                      "Follow proper ESD procedures during installation",
                      "Ensure adequate ventilation and cooling",
                      "Document cable connections with labels"
                    ],
                    commonIssues: [
                      "Insufficient rack space - verify dimensions before installation",
                      "Power requirements exceed available capacity",
                      "Incompatible rack mounting hardware"
                    ]
                  },
                  configurationExamples: [
                    "Rack Unit Position: U15-U17",
                    "Power: Dual PSU to separate PDUs",
                    "Management Port: Connected to OOB network"
                  ],
                  validationCriteria: [
                    "Device properly secured in rack",
                    "All power indicators showing green",
                    "Cooling fans operational",
                    "Cable management completed"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-impl-infra-002`,
                title: "Initial Device Boot and Connectivity Verification",
                description: `Power on ${product.name}, verify boot process completion, and establish initial management connectivity.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-infra-001`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 2, unit: "HOURS" },
                  requiredSkills: ["Console Access", "Basic Troubleshooting"],
                  riskLevel: "LOW",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/initial-boot`],
                    bestPractices: [
                      "Save console output logs during first boot",
                      "Record default credentials securely",
                      "Verify firmware version matches requirements"
                    ]
                  },
                  validationCriteria: [
                    "Device completes boot sequence successfully",
                    "Console access established",
                    "System health checks pass",
                    "Default configuration loaded"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 6, unit: "HOURS" },
              requiredSkills: ["Hardware Installation", "Network Cabling"],
              riskLevel: "LOW"
            }
          },
          {
            name: "Base Configuration",
            description: "Configure management access, network interfaces, and user authentication",
            order: 2,
            dependencies: ["Infrastructure Preparation"],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-impl-config-001`,
                title: "Configure Management Interface and Basic Settings",
                description: `Set up management interface with IP configuration, configure hostname, domain, and NTP settings for ${product.name}.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-infra-002`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 2, unit: "HOURS" },
                  requiredSkills: [`${vendor.name} Configuration`, "Network Administration"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    configurationCommands: this.getConfigurationCommands(vendor.name, product.category),
                    documentationLinks: [`${vendor.website}/documentation/management-setup`],
                    bestPractices: [
                      "Use dedicated management network for security",
                      "Configure redundant NTP servers",
                      "Enable secure management protocols only"
                    ]
                  },
                  configurationExamples: [
                    "Management Interface: GigabitEthernet0/0",
                    "IP Address: 192.168.1.100/24",
                    "Gateway: 192.168.1.1"
                  ],
                  validationCriteria: [
                    "Management interface responds to ping",
                    "Web interface accessible via HTTPS",
                    "NTP synchronization successful",
                    "DNS resolution working"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-impl-config-002`,
                title: "Configure Network Interfaces and Routing",
                description: `Configure data plane interfaces, VLAN assignments, routing protocols, and network segmentation for ${product.name}.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-config-001`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 3, unit: "HOURS" },
                  requiredSkills: ["Network Engineering", "Routing Protocols"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    configurationCommands: this.getNetworkingCommands(vendor.name, product.category),
                    documentationLinks: [`${vendor.website}/documentation/network-configuration`],
                    bestPractices: [
                      "Follow approved network segmentation design",
                      "Configure interface descriptions for clarity",
                      "Enable spanning tree protection features"
                    ]
                  },
                  validationCriteria: [
                    "All interfaces operational at correct speed/duplex",
                    "VLANs properly configured and tagged",
                    "Routing table contains expected routes",
                    "Network connectivity verified end-to-end"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-impl-config-003`,
                title: "Configure User Authentication and Access Control",
                description: `Set up administrative accounts, configure TACACS+/RADIUS integration, and implement role-based access control for ${product.name}.`,
                type: "ACTION",
                priority: "MEDIUM",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-config-002`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 2, unit: "HOURS" },
                  requiredSkills: ["Security Administration", "AAA Configuration"],
                  riskLevel: "HIGH",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/authentication`],
                    bestPractices: [
                      "Implement centralized authentication where possible",
                      "Configure local fallback accounts",
                      "Apply principle of least privilege"
                    ]
                  },
                  validationCriteria: [
                    "Administrative accounts configured with strong passwords",
                    "TACACS+/RADIUS authentication working",
                    "Role-based access permissions verified",
                    "Audit logging enabled for all access"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 7, unit: "HOURS" },
              requiredSkills: [`${vendor.name} Configuration`, "Network Administration", "Security"],
              riskLevel: "MEDIUM"
            }
          },
          {
            name: "Security Policy Implementation",
            description: "Configure security policies, threat protection features, and high availability",
            order: 3,
            dependencies: ["Base Configuration"],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-impl-security-001`,
                title: "Configure Security Policies and Rules",
                description: `Implement security policies, access control rules, and zone-based security architecture based on the approved design for ${product.name}.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-config-003`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 4, unit: "HOURS" },
                  requiredSkills: ["Security Policy Configuration", `${vendor.name} Security`],
                  riskLevel: "HIGH",
                  vendorSpecific: {
                    productVersion: product.version,
                    configurationCommands: this.getSecurityPolicyCommands(vendor.name, product.category),
                    documentationLinks: [`${vendor.website}/documentation/security-policies`],
                    bestPractices: [
                      "Start with deny-all policy and add specific allow rules",
                      "Log all security events for monitoring",
                      "Test policies in monitor mode before enforcement"
                    ]
                  },
                  validationCriteria: [
                    "Security policies applied and active",
                    "Zone-based architecture implemented",
                    "Access control rules tested and verified",
                    "Security logs being generated"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-impl-security-002`,
                title: "Configure Threat Protection Features",
                description: `Enable and configure IPS/IDS, malware protection, URL filtering, application control, and other threat prevention features for ${product.name}.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-security-001`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 4, unit: "HOURS" },
                  requiredSkills: ["Threat Prevention", "Security Operations"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/threat-protection`],
                    bestPractices: [
                      "Update threat signatures to latest version",
                      "Tune IPS to minimize false positives",
                      "Configure automated threat intelligence updates"
                    ]
                  },
                  validationCriteria: [
                    "IPS/IDS signatures updated and active",
                    "Malware protection enabled and scanning",
                    "URL filtering categories configured",
                    "Application control policies enforced"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-impl-security-003`,
                title: "Configure High Availability and Redundancy",
                description: `Set up HA cluster configuration, configure failover mechanisms, state synchronization, and verify redundancy for ${product.name}.`,
                type: "ACTION",
                priority: "MEDIUM",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-security-002`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 6, unit: "HOURS" },
                  requiredSkills: ["High Availability", "Cluster Management"],
                  riskLevel: "HIGH",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/high-availability`],
                    bestPractices: [
                      "Use dedicated HA links for state synchronization",
                      "Configure monitoring for both cluster members",
                      "Document failover procedures"
                    ]
                  },
                  validationCriteria: [
                    "HA cluster formed successfully",
                    "State synchronization working",
                    "Failover tested successfully",
                    "Recovery time meets requirements"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 14, unit: "HOURS" },
              requiredSkills: ["Security Configuration", "Threat Prevention", "High Availability"],
              riskLevel: "HIGH"
            }
          },
          {
            name: "Integration and Validation",
            description: "Integrate with enterprise systems and perform comprehensive validation testing",
            order: 4,
            dependencies: ["Security Policy Implementation"],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-impl-integrate-001`,
                title: "Integration with Existing Infrastructure",
                description: `Connect ${product.name} to enterprise monitoring systems, configure log forwarding to SIEM, integrate with ticketing systems, and establish operational procedures.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-security-003`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 4, unit: "HOURS" },
                  requiredSkills: ["Systems Integration", "SIEM Configuration"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/integration`],
                    bestPractices: [
                      "Configure syslog with appropriate severity levels",
                      "Set up SNMP monitoring with secure v3",
                      "Document all integration points"
                    ]
                  },
                  validationCriteria: [
                    "Logs successfully forwarded to SIEM",
                    "SNMP monitoring operational",
                    "Alerts generating in ticketing system",
                    "Backup procedures configured"
                  ]
                }
              },
              {
                id: `${vendor.name.toLowerCase()}-impl-integrate-002`,
                title: "Perform Comprehensive Functionality Testing",
                description: `Execute full testing suite for ${product.name} including network connectivity, security policy enforcement, performance validation, and failover testing.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [`${vendor.name.toLowerCase()}-impl-integrate-001`],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 6, unit: "HOURS" },
                  requiredSkills: ["Testing Methodologies", "Network Troubleshooting"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/testing`],
                    bestPractices: [
                      "Test all critical network paths",
                      "Validate security policy enforcement",
                      "Perform load testing under realistic conditions",
                      "Document all test results"
                    ]
                  },
                  validationCriteria: [
                    "All connectivity tests pass",
                    "Security policies enforced correctly",
                    "Performance meets requirements",
                    "HA failover successful"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 10, unit: "HOURS" },
              requiredSkills: ["Testing", "Integration", "Troubleshooting"],
              riskLevel: "MEDIUM"
            }
          }
        ],
        metadata: {
          vendor,
          product,
          demoContext: {
            targetAudience: ["TECHNICAL"],
            focusAreas: ["implementation", "configuration", "testing"],
            competitiveAdvantages: ["proven_implementation", "comprehensive_testing", "expert_support"]
          }
        }
      }
    };
  }

  generateSecurityAuditPhase(vendor: VendorConfig, product: ProductConfig): PhaseTemplateData {
    return {
      name: `${product.name} - Security Audit Phase`,
      description: `Comprehensive security audit of ${product.name} implementation including compliance validation, vulnerability assessment, and security posture review.`,
      type: PhaseType.REVIEW,
      isDefault: false,
      workflow: {
        stages: [
          {
            name: "Security Configuration Review",
            description: "Review and validate security configurations against best practices",
            order: 1,
            dependencies: [],
            tasks: [
              {
                id: `${vendor.name.toLowerCase()}-audit-config-001`,
                title: "Audit Security Policy Configuration",
                description: `Review all security policies, access control rules, and threat protection settings to ensure compliance with security standards and best practices.`,
                type: "ACTION",
                priority: "HIGH",
                required: true,
                dependencies: [],
                metadata: {
                  technicalLevel: "TECHNICAL",
                  estimatedDuration: { value: 4, unit: "HOURS" },
                  requiredSkills: ["Security Auditing", `${vendor.name} Security`, "Compliance"],
                  riskLevel: "MEDIUM",
                  vendorSpecific: {
                    productVersion: product.version,
                    documentationLinks: [`${vendor.website}/documentation/security-audit`],
                    bestPractices: [
                      "Review against industry security frameworks",
                      "Validate least-privilege access implementation",
                      "Check for unused or overly permissive rules"
                    ]
                  },
                  validationCriteria: [
                    "All security policies reviewed and documented",
                    "Non-compliant configurations identified",
                    "Remediation recommendations provided"
                  ]
                }
              }
            ],
            metadata: {
              estimatedDuration: { value: 1, unit: "DAYS" },
              requiredSkills: ["Security Auditing", "Compliance"],
              riskLevel: "MEDIUM"
            }
          }
        ],
        metadata: {
          vendor,
          product,
          demoContext: {
            targetAudience: ["TECHNICAL", "MANAGEMENT"],
            focusAreas: ["security", "compliance", "audit"],
            competitiveAdvantages: ["comprehensive_audit", "compliance_expertise", "security_validation"]
          }
        }
      }
    };
  }

  private getConfigurationCommands(vendorName: string, category: string): string[] {
    const commands: { [key: string]: { [key: string]: string[] } } = {
      "Cisco": {
        "security_appliance": [
          "configure network ipv4 192.168.1.100 255.255.255.0 192.168.1.1",
          "configure hostname FP4200-Primary",
          "configure domain example.com",
          "configure ntp 192.168.1.10"
        ],
        "email_security": [
          "interfaceconfig",
          "setip eth0 192.168.1.100 255.255.255.0 192.168.1.1",
          "hostname mail-gateway",
          "ntpconfig add 192.168.1.10"
        ],
        "wireless_controller": [
          "configure interface vlan management 192.168.1.100 255.255.255.0",
          "hostname WLC-Primary",
          "ntp server 192.168.1.10"
        ]
      },
      "Palo Alto Networks": {
        "security_appliance": [
          "set deviceconfig system ip-address 192.168.1.100 netmask 255.255.255.0 default-gateway 192.168.1.1",
          "set deviceconfig system hostname PA-5450-Primary",
          "set deviceconfig system domain example.com",
          "set deviceconfig system ntp-servers primary-ntp-server ntp-server-address 192.168.1.10"
        ]
      },
      "Fortinet": {
        "security_appliance": [
          "config system interface",
          "edit mgmt",
          "set ip 192.168.1.100 255.255.255.0",
          "set allowaccess https ssh ping",
          "end",
          "config system global",
          "set hostname FortiGate-Primary",
          "end"
        ]
      }
    };

    return commands[vendorName]?.[category] || [];
  }

  private getNetworkingCommands(vendorName: string, category: string): string[] {
    const commands: { [key: string]: { [key: string]: string[] } } = {
      "Cisco": {
        "security_appliance": [
          "interface GigabitEthernet0/1",
          "description Outside Interface",
          "nameif outside",
          "security-level 0",
          "ip address 203.0.113.10 255.255.255.0",
          "no shutdown"
        ],
        "wireless_controller": [
          "interface vlan 10",
          "description Guest Network",
          "ip address 192.168.10.1 255.255.255.0",
          "ip helper-address 192.168.1.10"
        ]
      },
      "Palo Alto Networks": {
        "security_appliance": [
          "set network interface ethernet ethernet1/1 layer3 ip 203.0.113.10/24",
          "set network interface ethernet ethernet1/1 comment \"Outside Interface\"",
          "set network virtual-router default interface ethernet1/1",
          "set network virtual-router default routing-table ip static-route default nexthop ip-address 203.0.113.1"
        ]
      },
      "Fortinet": {
        "security_appliance": [
          "config system interface",
          "edit port1",
          "set mode static",
          "set ip 203.0.113.10 255.255.255.0",
          "set allowaccess https ping ssh",
          "next",
          "end"
        ]
      }
    };

    return commands[vendorName]?.[category] || [
      `${vendorName.toLowerCase()} interface configuration`,
      "Configure network interfaces and VLANs",
      "Setup routing protocols",
      "Verify connectivity"
    ];
  }

  private getSecurityPolicyCommands(vendorName: string, category: string): string[] {
    const commands: { [key: string]: { [key: string]: string[] } } = {
      "Cisco": {
        "security_appliance": [
          "access-list OUTSIDE_IN extended deny ip any any log",
          "access-list INSIDE_OUT extended permit ip 192.168.0.0 255.255.0.0 any",
          "access-group OUTSIDE_IN in interface outside",
          "access-group INSIDE_OUT in interface inside"
        ]
      },
      "Palo Alto Networks": {
        "security_appliance": [
          "set rulebase security rules deny-all action deny",
          "set rulebase security rules allow-outbound from inside to outside source 192.168.0.0/16 action allow"
        ]
      },
      "Fortinet": {
        "security_appliance": [
          "config firewall policy",
          "edit 1",
          "set srcintf internal",
          "set dstintf wan1",
          "set srcaddr all",
          "set dstaddr all",
          "set action accept",
          "set schedule always",
          "set service ALL",
          "end"
        ]
      }
    };

    return commands[vendorName]?.[category] || [];
  }
}

// 🔧 IMPROVED: Comprehensive cleanup function
async function cleanupPhaseTemplates(options: {
  cleanAll?: boolean,
  vendorName?: string,
  keepDefaults?: boolean
} = {}) {
  console.log('🧹 Starting phase template cleanup...');
  
  const { cleanAll = false, vendorName, keepDefaults = true } = options;
  
  try {
    let whereClause: any = {};
    
    if (cleanAll) {
      // Clean all templates except defaults if keepDefaults is true
      whereClause = keepDefaults ? { isDefault: false } : {};
      console.log(`  🗑️  Cleaning ${keepDefaults ? 'non-default' : 'all'} phase templates...`);
    } else if (vendorName) {
      // Clean templates for specific vendor
      const vendor = vendors[vendorName as keyof typeof vendors];
      if (vendor) {
        whereClause = {
          isDefault: false,
          name: { contains: vendor.name }
        };
        console.log(`  🗑️  Cleaning templates for vendor: ${vendor.name}...`);
      } else {
        console.warn(`⚠️  Unknown vendor: ${vendorName}`);
        return;
      }
    } else {
      console.log('  ℹ️  No cleanup specified, skipping...');
      return;
    }

    const templateCount = await prisma.phaseTemplate.count({ where: whereClause });
    await prisma.phaseTemplate.deleteMany({ where: whereClause });
    console.log(`    ✅ Deleted ${templateCount} phase templates`);

  } catch (error) {
    console.error('❌ Error during phase template cleanup:', error);
    throw error;
  }
}

// 🔧 IMPROVED: Idempotent template creation with duplicate checking
async function populatePhaseTemplates(options: {
  vendorName?: string,
  productNames?: string[],
  skipCleanup?: boolean,
  forceRecreate?: boolean
} = {}) {
  console.log('🚀 Starting phase template population...');
  
  const { vendorName, productNames, skipCleanup = false, forceRecreate = false } = options;
  
  const generator = new PhaseTemplateGenerator();
  const templates: PhaseTemplateData[] = [];

  try {
    // Determine which vendors and products to process
    const vendorsToProcess = vendorName ? [vendorName] : Object.keys(vendors);
    
    for (const vendorKey of vendorsToProcess) {
      const vendor = vendors[vendorKey as keyof typeof vendors];
      if (!vendor) {
        console.warn(`⚠️  Unknown vendor: ${vendorKey}`);
        continue;
      }

      console.log(`📦 Processing vendor: ${vendor.name}`);

      // Get products for this vendor
      const vendorProducts = Object.entries(products).filter(([key, product]) => {
        if (vendorKey === 'cisco') return key.startsWith('cisco');
        if (vendorKey === 'paloAlto') return key.startsWith('paloAlto');
        if (vendorKey === 'fortinet') return key.startsWith('forti');
        return false;
      });

      for (const [productKey, product] of vendorProducts) {
        if (productNames && !productNames.includes(productKey)) continue;

        console.log(`  📋 Creating templates for: ${product.name}`);

        // 🔧 IMPROVED: Check for existing templates
        const existingTemplates = await prisma.phaseTemplate.findMany({
          where: {
            name: {
              contains: product.name
            }
          }
        });

        if (existingTemplates.length > 0 && !forceRecreate) {
          console.log(`    ⚠️  Templates for ${product.name} already exist (${existingTemplates.length} found), skipping...`);
          console.log(`    💡 Use --force-recreate to overwrite existing templates`);
          continue;
        }

        // Generate templates for each phase type
        templates.push(generator.generatePlanningPhase(vendor, product));
        templates.push(generator.generateImplementationPhase(vendor, product));
        templates.push(generator.generateSecurityAuditPhase(vendor, product));
      }
    }

    // 🔧 IMPROVED: Cleanup with better options
    if (!skipCleanup || forceRecreate) {
      await cleanupPhaseTemplates({ 
        vendorName, 
        cleanAll: !vendorName,
        keepDefaults: true 
      });
    }

    // Create templates in database
    console.log(`💾 Creating ${templates.length} phase templates...`);
    
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const template of templates) {
      try {
        // 🔧 IMPROVED: Check for existing template by exact name
        const existing = await prisma.phaseTemplate.findFirst({
          where: { name: template.name }
        });

        if (existing && !forceRecreate) {
          console.log(`  ⚠️  Skipped (exists): ${template.name}`);
          skippedCount++;
          continue;
        }

        // Delete existing if force recreate
        if (existing && forceRecreate) {
          await prisma.phaseTemplate.delete({
            where: { id: existing.id }
          });
          console.log(`  🔄 Replaced: ${template.name}`);
        }

        await prisma.phaseTemplate.create({
          data: {
            name: template.name,
            description: template.description,
            type: template.type,
            isDefault: template.isDefault,
            workflow: template.workflow as any
          }
        });
        
        console.log(`  ✅ Created: ${template.name}`);
        createdCount++;
      } catch (error) {
        console.error(`  ❌ Failed to create: ${template.name}`, error);
      }
    }

    console.log(`🎉 Phase template population completed!`);
    console.log(`📊 Summary: ${createdCount} created, ${skippedCount} skipped`);

    // 🔧 IMPROVED: Summary statistics
    const totalTemplates = await prisma.phaseTemplate.count();
    const templatesByType = await prisma.phaseTemplate.groupBy({
      by: ['type'],
      _count: { type: true }
    });

    console.log('\n📊 Template Statistics:');
    console.log(`  Total Templates: ${totalTemplates}`);
    templatesByType.forEach(({ type, _count }) => {
      console.log(`  ${type}: ${_count.type}`);
    });

  } catch (error) {
    console.error('❌ Error populating phase templates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 🔧 IMPROVED: CLI interface with comprehensive options
async function main() {
  const args = process.argv.slice(2);
  const vendorArg = args.find(arg => arg.startsWith('--vendor='))?.split('=')[1];
  const productsArg = args.find(arg => arg.startsWith('--products='))?.split('=')[1]?.split(',');
  const skipCleanup = args.includes('--skip-cleanup');
  const forceRecreate = args.includes('--force-recreate');
  const cleanAll = args.includes('--clean-all');

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔧 Phase Template Population Script

Usage: npm run populate-phase-templates [options]

Options:
  --vendor=<name>        Process specific vendor (cisco, paloAlto, fortinet)
  --products=<list>      Comma-separated list of products to process
  --skip-cleanup         Skip cleanup of existing templates
  --force-recreate       Force recreation of existing templates
  --clean-all           Clean all non-default templates before creating
  --help, -h            Show this help message

Examples:
  npm run populate-phase-templates
  npm run populate-phase-templates --vendor=cisco
  npm run populate-phase-templates --vendor=cisco --products=ciscoFirepower
  npm run populate-phase-templates --force-recreate
  npm run populate-phase-templates --clean-all
    `);
    return;
  }

  try {
    if (cleanAll) {
      await cleanupPhaseTemplates({ cleanAll: true, keepDefaults: true });
    }

    await populatePhaseTemplates({ 
      vendorName: vendorArg, 
      productNames: productsArg,
      skipCleanup,
      forceRecreate
    });
  } catch (error) {
    console.error('❌ Error populating phase templates:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { populatePhaseTemplates, cleanupPhaseTemplates, PhaseTemplateGenerator, vendors, products };

// Run if called directly
if (require.main === module) {
  main();
}
